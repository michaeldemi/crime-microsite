import RSS from 'rss';
  import fs from 'fs';
  import path from 'path';
  import { fileURLToPath } from 'url';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // At the top, define the FSAs
  const targetFSAs = ['L6A', 'L4K', 'L3L', 'L4H', 'L4J', 'L4L', 'L0J', ]; // Add more as needed

  // NEW: Define cities with their municipalities and FSAs
const cities = [
  {
    name: 'Vaughan',
    municipality: 'Vaughan',
    fsas: ['L6A', 'L4K', 'L3L', 'L4H', 'L4J', 'L4L', 'L0J'],
  },

    {
    name: 'Markham',
    municipality: 'Markham',
    fsas: ['L3P', 'L3R', 'L3S', 'L3T', 'L6B', 'L6C', 'L6E', 'L6G'],
  },

 {
    name: 'Richmond Hill',
    municipality: 'Richmond Hill',
    fsas: ['L4B', 'L4C', 'L4E', 'L4S'],
  },
  // Add more cities here
];

  async function generateRssFeed() {
    for (const city of cities) { // NEW: Loop over cities
      for (const fsa of city.fsas) { // Loop over FSAs within each city
        // 1. Configure the main feed details (customize per FSA and city)
        const feed = new RSS({
          title: `${fsa} ${city.name} Break-in Alerts (Yesterday)`, // UPDATED: Dynamic city name
          description: `Recent residential break-ins in ${fsa} FSA with intersection locations for yesterday.`,
          feed_url: `https://safetyreport.windowguardian.ca/feed-${fsa}.xml`,
          site_url: 'https://safetyreport.windowguardian.ca/',
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
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
          try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.status !== 'OK' || !data.results[0]) {
              console.log(`No address found for ${lat},${lng}`);
              return 'No address found';
            }
            const address = data.results[0].formatted_address;
            console.log(`Geocoding result for ${lat},${lng}: ${address}`);
            // Check if it's an intersection (contains '&', 'at', or '/')
            if (address.includes(' & ') || address.toLowerCase().includes(' at ') || address.includes(' / ')) {
              return address.split(',')[0]; // e.g., "Jane St / Rutherford Rd"
            } else {
              // Generalize to street area
              const components = data.results[0].address_components;
              const street = components.find(comp => comp.types.includes('route'))?.long_name;
              return street ? `${street} area` : 'No intersection found';
            }
          } catch (error) {
            console.log(`Geocoding error for ${lat},${lng}:`, error);
            return 'Address unavailable';
          }
        }

        try {
          // 2. Load GeoJSON data for FSA mapping (load only the current FSA)
          const geojsonDir = path.join(__dirname, '..', 'data', 'geojson');
          const geojsonFiles = [fsa]; // Only load the current FSA
          const dataArray = geojsonFiles.map(file => {
            const filePath = path.join(geojsonDir, `${file}.geojson`);
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
          });
          const allFeatures = dataArray.flatMap(d => d.features).filter(f => 
            f.geometry && f.geometry.coordinates && f.geometry.coordinates[0] && f.geometry.coordinates[0].length >= 3
          );
          const mapData = { features: allFeatures };

          // 3. Fetch crime data (same for all FSAs)
          const whereClause = "occ_type='Break and Enter - Residential'";
          const url = `https://services8.arcgis.com/lYI034SQcOoxRCR7/arcgis/rest/services/Occurrence/FeatureServer/0/query?outFields=*&where=${encodeURIComponent(whereClause)}&f=geojson&orderByFields=occ_date DESC`;
          const response = await fetch(url);
          const data = await response.json();
          let features = data.features;

          // Filter to yesterday
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1); // Subtract 1 day
          const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
          const endOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1);
          features = features.filter(f => {
            const incidentDate = new Date(f.properties.occ_date);
            return incidentDate >= startOfYesterday && incidentDate < endOfYesterday;
          });

          // Filter for the current city's municipality
          const cityFeatures = features.filter(feature => feature.properties.municipality === city.municipality);

          // Get FSAs and filter to the current FSA
          const fsaFeatures = [];
          cityFeatures.forEach(feature => {
            const lat = feature.geometry?.coordinates?.[1];
            const lng = feature.geometry?.coordinates?.[0];
            if (!lat || !lng) return;
            const closestFsa = findClosestFSA(lat, lng, mapData);
            if (closestFsa === fsa) fsaFeatures.push(feature);
          });

          // Add individual items for the current FSA incidents
          for (const feature of fsaFeatures) {
            const lat = feature.geometry.coordinates[1];
            const lng = feature.geometry.coordinates[0];
            console.log(`Processing coordinates for ${fsa}: lat=${lat}, lng=${lng}`);
            const intersection = await getIntersection(lat, lng);
            console.log(`Intersection result: ${intersection}`);
            const description = `<strong>Date of Incident:</strong> ${new Date(feature.properties.occ_date).toLocaleDateString()}<br><strong>Location:</strong> Near ${intersection}<br><a href="https://safetyreport.windowguardian.ca/?FSA=${fsa}">View Break-In Map to spot trends and stay proactive.</a>`;
            feed.item({
              title: 'Incident Details',
              description,
              url: 'https://safetyreport.windowguardian.ca/',
              date: new Date(feature.properties.occ_date),
            });
            await new Promise(resolve => setTimeout(resolve, 500)); // Delay
          }

          // 5. Write the generated XML to a file (unique per FSA)
          fs.writeFileSync(path.join(__dirname, '..', `feed-${fsa}.xml`), feed.xml({ indent: true }));
          console.log(`✅ RSS feed for ${fsa} Vaughan break-ins (yesterday) generated successfully!`);

        } catch (error) {
          console.error(`❌ Error generating RSS feed for ${fsa}:`, error);
        }
      }
    }
  }

  generateRssFeed();
