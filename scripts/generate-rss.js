import RSS from 'rss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateRssFeed() {
  // 1. Configure the main feed details
  const feed = new RSS({
    title: 'L6A Vaughan Break-in Alerts (Last 7 Days)',
    description: 'Recent residential break-ins in L6A FSA with intersection locations.',
    feed_url: 'https://safetyreport.windowguardian.ca/feed.xml', // Update to your URL
    site_url: 'https://safetyreport.windowguardian.ca/', // Update to your URL
    language: 'en',
    pubDate: new Date(),
  });

  // Helper functions (copied from your HTML script)
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function calculateCentroid(coordinates) {
    if (!coordinates || !coordinates[0] || coordinates[0].length < 3) return null;
    const ring = coordinates[0];
    let sumLng = 0, sumLat = 0, count = 0;
    ring.forEach(coord => {
      sumLng += coord[0];
      sumLat += coord[1];
      count++;
    });
    return [sumLng / count, sumLat / count];
  }

  function findClosestFSA(lat, lng, mapData) {
    let closest = null;
    let minDistance = Infinity;
    mapData.features.forEach(feature => {
      const centroid = calculateCentroid(feature.geometry.coordinates);
      if (!centroid) return;
      const [refLng, refLat] = centroid;
      const distance = haversineDistance(lat, lng, refLat, refLng);
      if (distance < minDistance) {
        minDistance = distance;
        closest = feature.properties.CFSAUID;
      }
    });
    return minDistance <= 5 ? closest : '';
  }

  async function getIntersection(lat, lng) {
    const apiKey = 'AIzaSyD-2EkkXVXjPBWjvW_u4SGSxz9wXeGAOv4'; // Replace with your key
    // First, try to find the nearest intersection using Places API
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1000&type=intersection&key=${apiKey}`;
    try {
      const placesResponse = await fetch(placesUrl);
      const placesData = await placesResponse.json();
      if (placesData.status === 'OK' && placesData.results.length > 0) {
        // Return the name of the nearest intersection
        return placesData.results[0].name; // e.g., "Main St & Elm St"
      }
    } catch (error) {
      console.log(`Places API error for ${lat},${lng}:`, error);
    }

    // Fallback to Geocoding API if no intersection found
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    try {
      const geoResponse = await fetch(geoUrl);
      const geoData = await geoResponse.json();
      if (geoData.status !== 'OK' || !geoData.results[0]) {
        console.log(`No address found for ${lat},${lng}`);
        return 'No address found';
      }
      const components = geoData.results[0].address_components;
      const streets = components.filter(comp => comp.types.includes('route')).map(comp => comp.long_name);
      if (streets.length >= 2) {
        return `${streets[0]} & ${streets[1]}`;
      } else if (streets.length === 1) {
        return `${streets[0]} area`;
      } else {
        const address = geoData.results[0].formatted_address;
        const parts = address.split(', ');
        return parts[0].replace(/^\d+\s*/, '') + ' area';
      }
    } catch (error) {
      console.log(`Geocoding API error for ${lat},${lng}:`, error);
      return 'Address unavailable';
    }
  }

  try {
    // 2. Load GeoJSON data for FSA mapping
    const geojsonDir = path.join(__dirname, '..', 'data', 'geojson');
    const geojsonFiles = ['L6A']; // Only load L6A
    const dataArray = geojsonFiles.map(file => {
      const filePath = path.join(geojsonDir, `${file}.geojson`);
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    });
    const allFeatures = dataArray.flatMap(d => d.features).filter(f => 
      f.geometry && f.geometry.coordinates && f.geometry.coordinates[0] && f.geometry.coordinates[0].length >= 3
    );
    const mapData = { features: allFeatures };

    // 3. Fetch crime data
    const whereClause = "occ_type='Break and Enter - Residential'";
    const url = `https://services8.arcgis.com/lYI034SQcOoxRCR7/arcgis/rest/services/Occurrence/FeatureServer/0/query?outFields=*&where=${encodeURIComponent(whereClause)}&f=geojson&orderByFields=occ_date DESC`;
    const response = await fetch(url);
    const data = await response.json();
    let features = data.features;

    // Filter to last 7 days
    const dates = features.map(f => new Date(f.properties.occ_date)).filter(d => !isNaN(d));
    if (dates.length === 0) throw new Error('No valid dates found.');
    const latestDate = new Date(Math.max(...dates));
    const sevenDaysAgo = new Date(latestDate);
    sevenDaysAgo.setDate(latestDate.getDate() - 7);
    features = features.filter(f => new Date(f.properties.occ_date) >= sevenDaysAgo);

    // Filter for Vaughan
    const vaughanFeatures = features.filter(feature => feature.properties.municipality === 'Vaughan');

    // Get FSAs and filter to L6A
    const l6aFeatures = [];
    vaughanFeatures.forEach(feature => {
      const lat = feature.geometry?.coordinates?.[1];
      const lng = feature.geometry?.coordinates?.[0];
      if (!lat || !lng) return;
      const fsa = findClosestFSA(lat, lng, mapData);
      if (fsa === 'L6A') l6aFeatures.push(feature);
    });

    // Add individual items for L6A incidents
    for (const feature of l6aFeatures) {
      const lat = feature.geometry.coordinates[1];
      const lng = feature.geometry.coordinates[0];
      console.log(`Processing coordinates: lat=${lat}, lng=${lng}`);
      const intersection = await getIntersection(lat, lng);
      console.log(`Intersection result: ${intersection}`);
      const description = `Location: ${intersection}, Date: ${new Date(feature.properties.occ_date).toLocaleDateString()}`;
      feed.item({
        title: 'L6A Vaughan Break-in Incident',
        description,
        url: 'https://safetyreport.windowguardian.ca/',
        date: new Date(feature.properties.occ_date),
      });
      // Add 2-second delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500)); // Optional
    }

    // 5. Write the generated XML to a file
    fs.writeFileSync(path.join(__dirname, '..', 'feed.xml'), feed.xml({ indent: true }));
    console.log('✅ RSS feed for L6A Vaughan break-ins (last 7 days) generated successfully!');

  } catch (error) {
    console.error('❌ Error generating RSS feed:', error);
  }
}

generateRssFeed();
