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

// Add additional logging in loadTPSRows:

async function loadTPSRows() {
  const url = TPS_URL || buildCkanSql(TPS_RESOURCE_ID, TPS_DATE_FIELD, CUTOFF);
  if (!url) throw new Error('Set TPS_URL or TPS_RESOURCE_ID env var');

  console.log(`Fetching TPS data from: ${url}`);
  
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`TPS fetch failed: ${res.status}`);
    
    // Get response as text first to check content
    const text = await res.text();
    console.log(`Response length: ${text.length} characters`);
    console.log(`First 100 chars: ${text.substring(0, 100)}`);
    
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.error('Error: TPS endpoint returned HTML instead of JSON');
      throw new Error('Received HTML instead of JSON from TPS endpoint');
    }
    
    // Parse text as JSON
    const json = JSON.parse(text);
    
    // For GeoJSON format
    if (json.type === 'FeatureCollection') {
      console.log(`Received GeoJSON with ${json.features?.length || 0} features`);
      
      // Map GeoJSON features to your expected format
      const rows = (json.features || []).map(feature => {
        const props = feature.properties || {};
        const geom = feature.geometry || {};
        const coords = geom.coordinates || [];
        
        // Get coordinates based on geometry type
        let lon = null, lat = null;
        if (geom.type === 'Point' && coords.length >= 2) {
          [lon, lat] = coords;
        }
        
        // Try to get date from properties
        const occurrence_date = props.OCC_DATE || props.occurrence_date || props.REPORT_DATE;
        
        return { occurrence_date, latitude: lat, longitude: lon };
      }).filter(p => isFinite(p.latitude) && isFinite(p.longitude) && p.occurrence_date);
      
      console.log(`Mapped ${rows.length} valid points with coordinates and dates`);
      return rows;
    }
    
    // For regular JSON
    const rows = json.result?.records || json.features || json.records || json.data || [];
    console.log(`Received ${rows.length} rows from TPS endpoint`);
    
    // Process as before with detailed logging
    const LAT_FIELDS = ['latitude','Lat','LAT','Y','y','lat','LAT_WGS84'];
    const LON_FIELDS = ['longitude','Lon','LON','X','x','lon','long','LONG','LONG_WGS84'];
    
    const processed = rows.map(r => {
      const lat = Number(pick(r, LAT_FIELDS));
      const lon = Number(pick(r, LON_FIELDS));
      const occurrence_date = r[TPS_DATE_FIELD] || r.occurrence_date || r.Report_Date || r.OCC_DATE;
      return { occurrence_date, latitude: lat, longitude: lon };
    }).filter(p => isFinite(p.latitude) && isFinite(p.longitude) && p.occurrence_date);
    
    console.log(`Processed ${processed.length} valid points with coordinates and dates`);
    return processed;
  } catch (err) {
    console.error('Error in loadTPSRows:', err);
    return [];
  }
}

async function loadFSAGeo() {
  try {
    // Check if file exists and has content
    const exists = await fs.access(FSA_GEOJSON)
      .then(() => true)
      .catch(() => false);
    
    if (!exists) {
      console.error(`GeoJSON file not found: ${FSA_GEOJSON}`);
      // Return empty array as fallback
      return [];
    }
    
    const raw = await fs.readFile(FSA_GEOJSON, 'utf8');
    
    // Log the first 100 chars to debug
    console.log(`GeoJSON file starts with: ${raw.substring(0, 100)}...`);
    
    if (raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html')) {
      console.error('Error: FSA GeoJSON file contains HTML instead of JSON');
      return [];
    }
    
    try {
      const gj = JSON.parse(raw);
      const features = gj.features || [];
      console.log(`Parsed ${features.length} FSA features`);
      
      return features.map(f => ({
        code: f.properties?.CFSAUID || f.properties?.FSA || f.properties?.fsa || f.properties?.FSAUID,
        feature: f,
        bbox: bbox(f)
      })).filter(f => !!f.code);
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError.message);
      return [];
    }
  } catch (err) {
    console.error('Error reading FSA GeoJSON:', err);
    return [];
  }
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

// Update fetchArcgisRows to handle HTML responses

async function fetchArcgisRows(baseUrl, cutoffDate) {
  const pageSize = 2000;
  let offset = 0;
  let all = [];
  
  // Page through all records
  while (true) {
    const url = buildArcgisUrl(baseUrl, cutoffDate, offset, pageSize);
    console.log(`Fetching ArcGIS data: ${url.substring(0, 100)}...`);
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ArcGIS fetch failed: ${res.status}`);
      
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('Error: ArcGIS returned HTML instead of JSON');
        console.log('Response starts with:', (await res.text()).substring(0, 200));
        throw new Error('Received HTML response instead of JSON');
      }
      
      const json = await res.json();
      const feats = Array.isArray(json.features) ? json.features : [];
      if (!feats.length) break;
      
      console.log(`Got ${feats.length} features from ArcGIS`);

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
      console.log(`Added ${rows.length} valid points, total: ${all.length}`);

      if (!json.exceededTransferLimit) break; // done
      offset += pageSize;
    } catch (err) {
      console.error('Error fetching ArcGIS data:', err);
      break; // Stop on error
    }
  }
  return all;
}

async function main() {
  console.log('Preprocess: starting…');
  await ensureDir(DATA_DIR);
  const [rows, fsaFeatures] = await Promise.all([loadTPSRows(), loadFSAGeo()]);
  console.log(`Rows: ${rows.length}, FSA polygons: ${fsaFeatures.length}`);

  const groups = new Map();
  let matched = 0, unmatched = 0;
  
  for (const r of rows) {
    const lon = Number(r.longitude), lat = Number(r.latitude);
    if (!isFinite(lon) || !isFinite(lat)) {
      unmatched++;
      continue;
    }
    
    const pt = [lon, lat];
    const candidates = fsaFeatures.filter(f => pointInBbox(pt, f.bbox));
    const ptFeat = turfPoint(pt);
    
    let code = null;
    for (const c of candidates) {
      if (booleanPointInPolygon(ptFeat, c.feature)) { 
        code = c.code; 
        break; 
      }
    }
    
    if (!code) {
      unmatched++;
      continue;
    }
    
    matched++;
    const arr = groups.get(code) || [];
    
    // Store only the required fields to match expected format
    arr.push({ 
      occurrence_date: r.occurrence_date, 
      latitude: lat, 
      longitude: lon 
    });
    groups.set(code, arr);
  }
  
  // This ensures each FSA file only contains points within that FSA's boundaries
  for (const [code, arr] of groups.entries()) {
    await fs.writeFile(
      path.join(DATA_DIR, `${code}.json`),
      JSON.stringify(arr, null, 2), 
      'utf8'
    );
  }
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });
