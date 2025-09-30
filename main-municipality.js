document.addEventListener('DOMContentLoaded', function () {
  // FSA to Municipality mapping (keep only this one, remove the duplicate)
  const fsaToMunicipality = {
    // Vaughan FSAs 
    'L4H': 'vaughan', 
    'L4J': 'vaughan', 
    'L4K': 'vaughan', 
    'L4L': 'vaughan',
    'L6A': 'vaughan',  // Moved from markham to vaughan
    
    // Richmond Hill FSAs  
    'L4C': 'richmond-hill', 
    'L4E': 'richmond-hill', 
    'L4S': 'richmond-hill',
    
    // Markham FSAs 
    'L3P': 'markham', 
    'L3R': 'markham', 
    'L3S': 'markham', 
    'L3T': 'markham',
    'L6B': 'markham', 
    'L6C': 'markham', 
    'L6E': 'markham', 
    'L6G': 'markham',
    
    // Aurora FSAs
    'L4G': 'aurora',
    
    // Newmarket FSAs
    'L3X': 'newmarket', 
    'L3Y': 'newmarket', 
    'L3Z': 'newmarket',
    
    // King FSAs
    'L0G': 'king', 
    'L7B': 'king',
    
    // Whitchurch-Stouffville FSAs
    'L4A': 'whitchurch-stouffville',
    
    // East Gwillimbury FSAs
    'L0C': 'east-gwillimbury', 
    'L9N': 'east-gwillimbury',
    
    // Georgina FSAs
    'L0E': 'georgina', 
    'L4P': 'georgina'
  };

  const municipalityNames = {
    'vaughan': 'Vaughan',
    'richmond-hill': 'Richmond Hill', 
    'markham': 'Markham',
    'aurora': 'Aurora',
    'newmarket': 'Newmarket',
    'king': 'King',
    'whitchurch-stouffville': 'Whitchurch-Stouffville',
    'east-gwillimbury': 'East Gwillimbury',
    'georgina': 'Georgina'
  };

  // Cache for municipality data
  let municipalityDataCache = {};

  // Formspark endpoints
  const FORMSPARK = {
    lead: 'ZpsuLRXX7',
    notInArea: 'YYyOI0pCQ',
    price1: 'XQZjL56XI',
    price2: 'XQZjL56XI'
  };

  // Utility functions
  function getLast30DaysCutoff() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }

  function getLast12MonthsCutoff() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }

  function show(el) {
    if (el) el.style.display = 'block';
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  function fsEndpoint(id) {
    return `https://submit-form.com/${id}`;
  }

  async function submitFS(formKey, payload) {
    try {
      const response = await fetch(fsEndpoint(FORMSPARK[formKey]), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return response.ok;
    } catch (err) {
      console.error('Form submission error:', err);
      return false;
    }
  }

  // Add municipality boundary checking (approximate)
  const municipalityBounds = {
    'vaughan': {
      minLat: 43.7800, maxLat: 43.8800,
      minLng: -79.5500, maxLng: -79.4000
    },
    'markham': {
      minLat: 43.8000, maxLat: 43.9000,
      minLng: -79.4000, maxLng: -79.2500
    },
    'richmond-hill': {
      minLat: 43.8600, maxLat: 43.9200,
      minLng: -79.4800, maxLng: -79.4000
    },
    // Add other municipalities as needed
  };

  // Function to check if coordinates are within municipality bounds
  function isWithinMunicipalityBounds(lat, lng, municipality) {
    const bounds = municipalityBounds[municipality];
    if (!bounds) return true; // If no bounds defined, include all
    
    return lat >= bounds.minLat && lat <= bounds.maxLat && 
           lng >= bounds.minLng && lng <= bounds.maxLng;
  }

  // Function to load all FSA data for a municipality
  async function loadMunicipalityData(municipality) {
    if (municipalityDataCache[municipality]) {
      return municipalityDataCache[municipality];
    }

    const fsasForMunicipality = Object.keys(fsaToMunicipality).filter(
      fsa => fsaToMunicipality[fsa] === municipality
    );

    console.log(`Loading data for ${municipality}, FSAs:`, fsasForMunicipality); // Debug

    let allData = [];
    const loadPromises = fsasForMunicipality.map(async (fsa) => {
      try {
        const resp = await fetch(`./data/${fsa}.json`, { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          console.log(`Loaded ${data.length} incidents for FSA ${fsa}`); // Debug
          
          // Filter data to only include incidents within the municipality bounds
          const filteredData = data.filter(incident => {
            const lat = incident.lat || incident.latitude || incident.Latitude;
            const lng = incident.lng || incident.lon || incident.longitude || incident.Longitude;
            
            if (!lat || !lng) return false;
            
            const withinBounds = isWithinMunicipalityBounds(parseFloat(lat), parseFloat(lng), municipality);
            
            if (!withinBounds) {
              console.log(`Filtering out incident from FSA ${fsa} - outside ${municipality} bounds:`, {
                lat: parseFloat(lat), 
                lng: parseFloat(lng),
                location: incident.location || incident.Location || 'Unknown'
              });
            }
            
            return withinBounds;
          });
          
          console.log(`After filtering: ${filteredData.length} incidents remain for FSA ${fsa} in ${municipality}`);
          return filteredData;
        }
      } catch (err) {
        console.warn(`No data for FSA ${fsa}:`, err);
      }
      return [];
    });

    const results = await Promise.all(loadPromises);
    results.forEach((fsaData, index) => {
      const fsa = fsasForMunicipality[index];
      console.log(`Adding ${fsaData.length} incidents from FSA ${fsa} to ${municipality}`); // Debug
      allData = allData.concat(fsaData);
    });

    console.log(`Total filtered incidents for ${municipality}: ${allData.length}`); // Debug
    municipalityDataCache[municipality] = allData;
    return allData;
  }

  // Get DOM elements
  const fsaForm = document.getElementById('fsa-form');
  const fsaInput = document.getElementById('fsa-input');
  const errorMessage = document.getElementById('error-message');
  const searchContainer = document.getElementById('search-container');
  const reportContainer = document.getElementById('report-container');

  // Main form submission handler
  if (fsaForm && fsaInput) {
    fsaForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const fsa = fsaInput.value.trim().toUpperCase();
      console.log(`Searching for FSA: ${fsa}`); // Debug
      
      if (!/^[A-Z][0-9][A-Z]$/.test(fsa)) {
        if (errorMessage) {
          errorMessage.textContent = 'Please enter a valid postal code (e.g., L4H)';
          show(errorMessage);
        }
        return;
      }

      const municipality = fsaToMunicipality[fsa];
      console.log(`FSA ${fsa} mapped to municipality: ${municipality}`); // Debug
      
      if (!municipality) {
        if (errorMessage) {
          errorMessage.textContent = 'Sorry, we don\'t have data for that postal code yet.';
          show(errorMessage);
        }
        
        await submitFS('notInArea', {
          fsa: fsa,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (errorMessage) hide(errorMessage);

      try {
        const municipalityData = await loadMunicipalityData(municipality);
        
        hide(searchContainer);
        if (reportContainer) show(reportContainer);
        
        const stickyFooter = document.getElementById('sticky-footer');
        if (stickyFooter) show(stickyFooter);
        
        // Store the search info
        window.currentFSA = fsa;
        window.currentMunicipality = municipality;
        
        renderMunicipalityReport(fsa, municipality, municipalityData);
        
        // Show FSA stats if in Vaughan
        showFSAStatsIfVaughan(fsa);
        
      } catch (err) {
        console.error('Error loading municipality data:', err);
        if (errorMessage) {
          errorMessage.textContent = 'Error loading data. Please try again.';
          show(errorMessage);
        }
      }
    });
  }

  // Function to render municipality report
  function renderMunicipalityReport(fsa, municipality, data) {
    const cutoff12 = getLast12MonthsCutoff();
    const cutoff30 = getLast30DaysCutoff();
    let count12 = 0, count30 = 0;
    
    (Array.isArray(data) ? data : []).forEach((e) => {
      const dt = parseDate(e && e.occurrence_date);
      if (!dt) return;
      if (dt >= cutoff12) count12++;
      if (dt >= cutoff30) count30++;
    });

    const municipalityName = municipalityNames[municipality] || municipality;
    
    // Update headlines
    const headline = document.getElementById('results-headline');
    const subheadline = document.getElementById('results-subheadline');
    
    if (headline) {
      headline.textContent = `${municipalityName} Safety Report`;
    }
    
    if (subheadline) {
      subheadline.textContent = `${count12} reported incidents in the past 12 months`;
    }

    // Render dashboard
    renderDashboard(municipalityName, count30, count12, data);
  }

  // Function to render dashboard
  function renderDashboard(municipalityName, count30, count12, data) {
    const dashboardSection = document.getElementById('dashboard-section');
    
    if (!dashboardSection) return;
    
    dashboardSection.innerHTML = `
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div class="text-center p-4 bg-red-50 rounded-lg border border-red-200">
            <div class="text-2xl font-bold text-red-600">${count12}</div>
            <div class="text-sm text-red-700">Total Incidents</div>
            <div class="text-xs text-red-600">Past 12 months</div>
          </div>
          <div class="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div class="text-2xl font-bold text-yellow-600">${Math.round(count12 / 12)}</div>
            <div class="text-sm text-yellow-700">Monthly Average</div>
            <div class="text-xs text-yellow-600">Incidents per month</div>
          </div>
          <div class="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
            <div class="text-2xl font-bold text-orange-600">${count30}</div>
            <div class="text-sm text-orange-700">Recent Activity</div>
            <div class="text-xs text-orange-600">Past 30 days</div>
          </div>
        </div>
        <div id="map" style="height: 400px; width: 100%;" class="rounded-lg border border-gray-200"></div>
      </div>
    `;
    
    show(dashboardSection);
    
    // Initialize map
    initializeMap(data);
  }

  // Function to initialize map with municipality data
  function initializeMap(data) {
    const mapElement = document.getElementById('map');
    if (!mapElement || !data.length) {
      console.log('No map element or no data:', mapElement, data.length);
      return;
    }

    console.log('Initializing map with data:', data.slice(0, 3)); // Debug: show first 3 records

    // Default center (you can adjust this)
    const map = L.map('map').setView([43.8561, -79.3370], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add markers for all incidents
    const markers = [];
    let validIncidents = 0;
    
    data.forEach((incident, index) => {
      // Check different possible field names for coordinates
      const lat = incident.lat || incident.latitude || incident.Latitude;
      const lng = incident.lng || incident.lon || incident.longitude || incident.Longitude;
      
      console.log(`Incident ${index}:`, { lat, lng, incident }); // Debug each incident
      
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const marker = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(map);
        
        // Check different possible field names for other data
        const offence = incident.offence || incident.offense || incident.type || incident.crime_type || 'Incident';
        const date = incident.occurrence_date || incident.date || incident.Date || 'Unknown';
        const location = incident.location || incident.Location || incident.address || 'Unknown';
        
        const popupContent = `
          <strong>${offence}</strong><br>
          Date: ${date}<br>
          Location: ${location}
        `;
        
        marker.bindPopup(popupContent);
        markers.push(marker);
        validIncidents++;
      } else {
        console.log(`Invalid coordinates for incident ${index}:`, incident);
      }
    });

    console.log(`Added ${validIncidents} valid incidents out of ${data.length} total`);

    // Fit map to show all markers
    if (markers.length > 0) {
      const group = new L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    } else {
      console.log('No valid markers to display');
    }
  }

  // Lead generation form handling
  const leadGenForm = document.getElementById('lead-gen-form');
  if (leadGenForm) {
    leadGenForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const payload = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        fsa: window.currentFSA || '',
        municipality: window.currentMunicipality || '',
        timestamp: new Date().toISOString()
      };
      
      const success = await submitFS('lead', payload);
      
      if (success) {
        // Show thank you message
        hide(document.getElementById('lead-gen-overlay'));
        // You can add thank you modal here
      }
    });
  }

  // Click outside to close overlay
  const overlay = document.getElementById('lead-gen-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) {
        hide(this);
      }
    });
  }

  // Quote button handlers
  const quoteBtn = document.getElementById('get-full-quote-btn');
  const stickyQuoteBtn = document.getElementById('sticky-quote-btn');
  
  if (quoteBtn) {
    quoteBtn.addEventListener('click', function() {
      show(overlay);
    });
  }
  
  if (stickyQuoteBtn) {
    stickyQuoteBtn.addEventListener('click', function() {
      show(overlay);
    });
  }

  // Store current search data globally
  window.currentFSA = '';
  window.currentMunicipality = '';

  // Function to calculate FSA statistics
  function calculateFSAStats(fsaData, fsaCode) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const twelveMonthsAgo = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));

    let last7Days = 0;
    let last30Days = 0;
    let last12Months = 0;

    fsaData.forEach(incident => {
        const incidentDate = parseDate(incident.occurrence_date);
        console.log('Raw:', incident.occurrence_date, 'Parsed:', incidentDate); // Add this line
        if (incidentDate && incidentDate <= now) {
            if (incidentDate >= sevenDaysAgo) last7Days++;
            if (incidentDate >= thirtyDaysAgo) last30Days++;
            if (incidentDate >= twelveMonthsAgo) last12Months++;
        }
    });

    return {
        fsa: fsaCode,
        last7Days,
        last30Days,
        last12Months
    };
  }

  // Function to load and display FSA statistics table
  async function loadVaughanFSAStats() {
    const vaughanFSAs = ['L4H', 'L4J', 'L4K', 'L4L', 'L6A'];
    const fsaStats = [];
    
    // Load data for each Vaughan FSA
    for (const fsa of vaughanFSAs) {
        try {
            const response = await fetch(`./data/${fsa}.json`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                const stats = calculateFSAStats(data, fsa);
                fsaStats.push(stats);
            } else {
                // If no data available, add zeros
                fsaStats.push({
                    fsa: fsa,
                    last7Days: 0,
                    last30Days: 0,
                    last12Months: 0
                });
            }
        } catch (err) {
            console.warn(`No data for FSA ${fsa}:`, err);
            // Add zeros for missing data
            fsaStats.push({
                fsa: fsa,
                last7Days: 0,
                last30Days: 0,
                last12Months: 0
            });
        }
    }
    
    // Sort by 12-month count (highest first)
    fsaStats.sort((a, b) => b.last12Months - a.last12Months);
    
    // Populate the table
    const tbody = document.getElementById('fsa-stats-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        
        fsaStats.forEach(stats => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            
            // Highlight the user's FSA if it matches
            const userFSA = getCurrentUserFSA(); // You'll need to implement this
            if (userFSA && stats.fsa === userFSA) {
                row.className += ' bg-blue-50 border-l-4 border-blue-500';
            }
            
            row.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900">${stats.fsa}</td>
                <td class="px-4 py-3 text-center ${stats.last7Days > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}">${stats.last7Days}</td>
                <td class="px-4 py-3 text-center ${stats.last30Days > 0 ? 'text-orange-600 font-semibold' : 'text-gray-600'}">${stats.last30Days}</td>
                <td class="px-4 py-3 text-center ${stats.last12Months > 0 ? 'text-gray-800 font-semibold' : 'text-gray-600'}">${stats.last12Months}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add click handlers to FSA codes in the table
        tbody.addEventListener('click', function(e) {
            const row = e.target.closest('tr');
            if (row) {
                const fsaCell = row.querySelector('td:first-child');
                if (fsaCell) {
                    const clickedFSA = fsaCell.textContent.trim();
                    // Update the search input and trigger a new search
                    const fsaInput = document.getElementById('fsa-input');
                    if (fsaInput) {
                        fsaInput.value = clickedFSA;
                        // Trigger form submission or your search function
                        const form = document.getElementById('fsa-form');
                        if (form) {
                          form.dispatchEvent(new Event('submit'));
                        }
                    }
                }
            }
        });
        
        // Show the table
        const tableContainer = document.getElementById('fsa-stats-table');
        if (tableContainer) {
            tableContainer.style.display = 'block';
        }
    }
  }

  // Helper function to get current user's FSA (implement based on your existing logic)
  function getCurrentUserFSA() {
    // Return the FSA that the user searched for
    const fsaInput = document.getElementById('fsa-input');
    return fsaInput ? fsaInput.value.toUpperCase() : null;
  }

  // Helper function to parse dates (use your existing parseDate function or implement)
  function parseDate(dateString) {
    if (!dateString) return null;
    let s = String(dateString).trim();
    // Replace the space between date and time with 'T'
    s = s.replace(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2').replace(/\/+/g, '-');
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // Try parsing just the date part
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) {
        d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  // Add this to your existing function that displays the dashboard/map
  // This should be called after the map is loaded and displayed

  // Show the FSA stats table for Vaughan areas
  if (isVaughanArea(userFSA)) { // Implement this check based on your logic
      loadVaughanFSAStats();
  }

  // Helper function to check if FSA is in Vaughan
  function isVaughanArea(fsa) {
      const vaughanFSAs = ['L4H', 'L4J', 'L4K', 'L4L', 'L6A'];
      return vaughanFSAs.includes((fsa || '').toUpperCase());
  }

  // Function to show FSA stats if in Vaughan
  async function showFSAStatsIfVaughan(fsa) {
    const userFSA = fsa || getCurrentUserFSA();
    if (isVaughanArea(userFSA)) {
        await loadVaughanFSAStats();
    } else {
        // Hide or clear the stats table if not in Vaughan
        const tableContainer = document.getElementById('fsa-stats-table');
        if (tableContainer) {
            tableContainer.style.display = 'none';
        }
    }
  }
});
