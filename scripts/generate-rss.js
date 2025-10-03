import fs from 'fs';
import RSS from 'rss';
import fetch from 'node-fetch';

async function generateRssFeed() {
  // 1. Configure the main feed details
  const feed = new RSS({
    title: 'Vaughan Residential Break-in Alerts',
    description: 'The most recent residential break-and-enter occurrences reported in Vaughan.',
    // IMPORTANT: Replace these with your actual GitHub username and repository name
    feed_url: 'https://michaeldemi.github.io/crime-microsite/feed.xml',
    site_url: 'https://michaeldemi.github.io/crime-microsite/',
    language: 'en',
    pubDate: new Date(),
  });

  // 2. Fetch the data from the ArcGIS API (the same one your page uses)
  const whereClause = "occ_type='Break and Enter - Residential'";
  const url = `https://services8.arcgis.com/lYI034SQcOoxRCR7/arcgis/rest/services/Occurrence/FeatureServer/0/query?outFields=*&where=${encodeURIComponent(whereClause)}&f=geojson&orderByFields=occ_date DESC`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // 3. Filter features for Vaughan and limit to the 25 most recent events
    const vaughanFeatures = data.features
      .filter(feature => feature.properties.municipality === 'Vaughan')
      .slice(0, 25); // The API sorts by date descending, so this gets the latest

    // 4. Loop through the data and add each incident to the feed
    vaughanFeatures.forEach(feature => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;

      const title = `Break-in Reported on ${props.occ_street || 'Unknown Street'}`;
      
      // Create a detailed description for the RSS item
      const description = `A residential break-in was reported in ${props.municipality} on ${new Date(props.occ_date).toDateString()}.
        <br>Premise Type: ${props.premisetype}.
        <br>Location: (${coords[1]}, ${coords[0]})`;

      feed.item({
        title: title,
        description: description,
        url: feed.site_url, // Link back to the main map page
        guid: props.OBJECTID, // The OBJECTID is a perfect unique identifier
        date: new Date(props.occ_date),
        lat: coords[1], // GeoRSS latitude
        long: coords[0] // GeoRSS longitude
      });
    });

    // 5. Write the generated XML to a file
    fs.writeFileSync('feed.xml', feed.xml({ indent: true }));
    console.log('✅ RSS feed for Vaughan crime data generated successfully!');

  } catch (error) {
    console.error('Error generating RSS feed:', error);
  }
}

generateRssFeed();

