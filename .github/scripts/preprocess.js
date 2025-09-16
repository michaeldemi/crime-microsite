import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { point as turfPoint } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const FSA_GEOJSON = path.join(DATA_DIR, 'fsa.geojson');

// Config via env (set in GitHub Actions)
const TPS_URL = process.env.TPS_URL || '';
const TPS_RESOURCE_ID = process.env.TPS_RESOURCE_ID || '';
const TPS_DATE_FIELD = process.env.TPS_DATE_FIELD || 'OCC_DATE';
const MONTHS_BACK = Number(process.env.MONTHS_BACK || 15);

// CKAN helper (Toronto Open Data)
function buildCkanSql(resourceId, dateField, cutoff) {
  const iso = cutoff.toISOString().slice(0, 10);
  const base = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search_sql';
  const sql = `
    SELECT *
    FROM "${resourceId}"
    WHERE "${dateField}" >= '${iso}'
  `;
  return `${base}?sql=${encodeURIComponent(sql)}`;
}
function cutoffDate(monthsBack) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setHours(0,0,0,0);
  return d;
}
const CUTOFF = cutoffDate(MONTHS_BACK);
function parseDateSafe(v){ if(!v) return null; const d=new Date(String(v).replace(' ','T')); return isNaN(d)?null:d; }
function pick(obj, keys){ for(const k of keys){ if(obj?.[k]!=null && obj[k]!=='') return obj[k]; } }

async function loadTPSRows() {
  const url = TPS_URL || buildCkanSql(TPS_RESOURCE_ID, TPS_DATE_FIELD, CUTOFF);
  if (!url) throw new Error('Set TPS_URL or TPS_RESOURCE_ID env var');

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TPS fetch failed: ${res.status}`);
  const json = await res.json();
  const rows = json.result?.records || json.records || json.data || [];

  // Add these fields for TPS data
  const LAT_FIELDS = ['latitude','Lat','LAT','Y','y','lat','LAT_WGS84'];
  const LON_FIELDS = ['longitude','Lon','LON','X','x','lon','long','LONG','LONG_WGS84'];

  return rows.map(r => {
    const lat = Number(pick(r, LAT_FIELDS));
    const lon = Number(pick(r, LON_FIELDS));
    const occurrence_date = r[dateField] || r.occurrence_date || r.Report_Date || r.OCC_DATE;
    return { occurrence_date, latitude: lat, longitude: lon };
  }).filter(p => isFinite(p.latitude) && isFinite(p.longitude) && p.occurrence_date);
}

async function loadFSAGeo() {
  const raw = await fs.readFile(FSA_GEOJSON, 'utf8');
  const gj = JSON.parse(raw);
  return (gj.features || []).map(f => ({
    code: f.properties?.CFSAUID || f.properties?.FSA || f.properties?.fsa || f.properties?.FSAUID,
    feature: f,
    bbox: bbox(f)
  })).filter(f => !!f.code);
}
function pointInBbox([x,y], bb){ return x>=bb[0] && x<=bb[2] && y>=bb[1] && y<=bb[3]; }
async function ensureDir(dir){ await fs.mkdir(dir, { recursive: true }); }

function buildArcgisUrl(baseUrl, cutoffDate, offset = 0, pageSize = 2000) {
  const url = new URL(baseUrl);
  const params = url.searchParams;
  const ts = cutoffDate.toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:MM:SS
  const whereBase = params.get('where') || '1=1';
  params.set('f', 'json');
  params.set('where', `${whereBase} AND OCC_DATE >= TIMESTAMP '${ts}'`);
  params.set('returnGeometry', 'true');
  params.set('outFields', params.get('outFields') || 'OCC_DATE');
  params.set('outSR', '4326');            // lon/lat
  params.set('resultRecordCount', String(pageSize));
  params.set('resultOffset', String(offset));
  return url.toString();
}

async function fetchArcgisRows(baseUrl, cutoffDate) {
  const pageSize = 2000;
  let offset = 0;
  let all = [];
  // Page through all records
  while (true) {
    const url = buildArcgisUrl(baseUrl, cutoffDate, offset, pageSize);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ArcGIS fetch ${res.status}`);
    const json = await res.json();
    const feats = Array.isArray(json.features) ? json.features : [];
    if (!feats.length) break;

    const rows = feats.map(f => {
      const a = f.attributes || {};
      const g = f.geometry || {};
      // Use geometry if available, else pick from attributes
      const lon = Number(g.x ?? pick(a, LON_FIELDS));
      const lat = Number(g.y ?? pick(a, LAT_FIELDS));
      const occurrence_date = a.OCC_DATE ?? a.occurrence_date ?? a.Report_Date;
      return { occurrence_date, latitude: lat, longitude: lon };
    }).filter(p => isFinite(p.latitude) && isFinite(p.longitude) && p.occurrence_date);
    all = all.concat(rows);

    if (!json.exceededTransferLimit) break; // done
    offset += pageSize;
  }
  return all;
}

async function main() {
  console.log('Preprocess: starting…');
  await ensureDir(DATA_DIR);
  const [rows, fsaFeatures] = await Promise.all([loadTPSRows(), loadFSAGeo()]);
  console.log(`Rows: ${rows.length}, FSA polygons: ${fsaFeatures.length}`);

  const groups = new Map();
  let matched = 0;

  for (const r of rows) {
    const lon = Number(r.longitude), lat = Number(r.latitude);
    const pt = [lon, lat];
    const candidates = fsaFeatures.filter(f => pointInBbox(pt, f.bbox));
    const ptFeat = turfPoint(pt);
    let code = null;
    for (const c of candidates) {
      if (booleanPointInPolygon(ptFeat, c.feature)) { code = c.code; break; }
    }
    if (!code) continue;
    matched++;
    const arr = groups.get(code) || [];
    arr.push({ occurrence_date: r.occurrence_date, latitude: lat, longitude: lon });
    groups.set(code, arr);
  }

  console.log(`Matched: ${matched}. Writing ${groups.size} FSA files…`);
  for (const [code, arr] of groups.entries()) {
    await fs.writeFile(path.join(DATA_DIR, `${code}.json`), JSON.stringify(arr, null, 2), 'utf8');
  }
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });
