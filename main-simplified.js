document.addEventListener('DOMContentLoaded', function () {
  // Essential DOM elements
  const fsaForm = document.getElementById('fsa-form');
  const fsaInput = document.getElementById('fsa-input');
  const errorMessage = document.getElementById('error-message');
  const searchContainer = document.getElementById('search-container');
  const reportContainer = document.getElementById('report-container');
  const resultsHeadline = document.getElementById('results-headline');
  const resultsSubheadline = document.getElementById('results-subheadline');
  const dashboardSection = document.getElementById('dashboard-section');
  const priceCheckFsa = document.getElementById('price-check-fsa');
  const mapContainerCard = document.getElementById('map-container-card');
  const mapCanvas = document.getElementById('map-card');
  const stickyFooter = document.getElementById('sticky-footer');
  const getFullQuoteBtn = document.getElementById('get-full-quote-btn');
  const leadGenOverlay = document.getElementById('lead-gen-overlay');
  const leadGenForm = document.getElementById('lead-gen-form');

  // Formspark endpoints
  const FORMSPARK = {
    lead: 'ZpsuLRXX7',        // Quote overlay form
    notInArea: 'YYyOI0pCQ'    // "Not in your area" form
  };
  
  function fsEndpoint(id) { return `https://submit-form.com/${id}`; }
  
  async function submitFS(formKey, payload) {
    const id = FORMSPARK[formKey];
    if (!id) throw new Error(`Formspark id missing for ${formKey}`);
    const res = await fetch(fsEndpoint(id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Formspark ${formKey} failed: ${res.status}`);
    return res;
  }

  // Utility functions
  function getLast30DaysCutoff() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  
  function getLast12MonthsCutoff() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  
  function parseDate(v) {
    if (!v) return null;
    const d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }
  
  function show(el) { if (el) el.style.display = ''; }
  function hide(el) { if (el) el.style.display = 'none'; }
  function setText(el, value) { if (el) el.textContent = value; }

  // UPDATED: Dashboard rendering function
  function renderDashboard(count12) {
    if (!dashboardSection) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const updated = `${y}/${m}/${d}`;

    dashboardSection.innerHTML = `
      <div class="pt-2">
        <div class="bg-white p-4 rounded-md text-black text-left shadow-sm border border-gray-100">
          
          <!-- NEW: Single-line stat with blue circle -->
          <div class="flex items-center gap-x-2">
            <div class="flex items-center justify-center bg-[#4e9acd] rounded-full w-9 h-9 flex-shrink-0">
              <span class="text-white font-bold text-lg">${count12}</span>
            </div>
            <div class="text-base text-gray-700 font-medium">Break-ins (Last 12 months)</div>
          </div>
          
          <!-- Map will be injected here -->
          <div id="map-container-card" class="relative w-full h-[200px] mt-4 rounded-md overflow-hidden border border-gray-200">
            <div id="map-card" class="w-full h-full"></div>
            <button id="map-expand-btn" class="absolute top-2 right-2 bg-white p-1.5 rounded-md shadow-md z-[1000] hover:bg-gray-100 transition" aria-label="Expand map">
                <svg id="map-expand-icon" class="h-5 w-5 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                <svg id="map-collapse-icon" class="h-5 w-5 text-gray-700 hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" /></svg>
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-x-2 text-sm mt-2">
            <span class="text-gray-400 text-xs">Updated ${updated}</span>
            <span class="text-gray-400 text-xs">Source: York Regional Police</span>
          </div>
        </div>
      </div>
    `;
    show(dashboardSection);
  }

  // Fix map zoom functionality
  function showMap(data) {
    // Get reference to map element - this happens AFTER dashboard is rendered
    const mapCanvas = document.getElementById('map-card');
    if (!mapCanvas) return;

    // Wait longer to ensure container is fully rendered and sized
    setTimeout(() => {
      if (window.leafletMap && typeof window.leafletMap.remove === 'function') {
        window.leafletMap.remove();
        window.leafletMap = null;
      }

      // Initialize map INSIDE the timeout to ensure container is ready
      window.leafletMap = L.map(mapCanvas.id).setView([43.8, -79.4], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(window.leafletMap);

      const cutoff12 = getLast12MonthsCutoff();
      const latlngs = [];
      (Array.isArray(data) ? data : []).forEach((entry) => {
        const dt = parseDate(entry && entry.occurrence_date);
        const lat = Number(entry && entry.latitude);
        const lng = Number(entry && entry.longitude);
        if (!dt || dt < cutoff12) return;
        if (!isFinite(lat) || !isFinite(lng)) return;
        const ll = [lat, lng];
        L.marker(ll).addTo(window.leafletMap);
        latlngs.push(ll);
      });

      // Now fit bounds with the fully initialized map
      if (latlngs.length > 0) {
        const bounds = L.latLngBounds(latlngs);
        window.leafletMap.fitBounds(bounds, { 
          padding: [50, 50], 
          maxZoom: 15 
        });
        
        // Sometimes an extra invalidateSize helps
        window.leafletMap.invalidateSize();
      } else {
        window.leafletMap.setView([43.8, -79.4], 11);
      }

      // Map expand/collapse button
      const expandBtn = document.getElementById('map-expand-btn');
      const mapContainerCard = document.getElementById('map-container-card');
      const expandIcon = document.getElementById('map-expand-icon');
      const collapseIcon = document.getElementById('map-collapse-icon');
      if (expandBtn && mapContainerCard) {
        expandBtn.onclick = () => {
          const expanded = mapContainerCard.style.height === '600px';
          mapContainerCard.style.height = expanded ? '200px' : '600px';
          if (expandIcon && collapseIcon) {
            expandIcon.classList.toggle('hidden', !expanded);
            collapseIcon.classList.toggle('hidden', expanded);
          }
          setTimeout(() => window.leafletMap.invalidateSize(), 300);
        };
      }
    }, 300); // Increased to 300ms for better reliability
  }

  // Main function to load and display report
  async function loadReport(rawFsa) {
    // Validate FSA format
    const fsa = String(rawFsa || '').trim().toUpperCase();
    if (!/^[A-Z][0-9][A-Z]$/.test(fsa)) {
      if (errorMessage) {
        errorMessage.textContent = 'Please enter a valid FSA code (e.g., L4H)';
        show(errorMessage);
      }
      return;
    }
    
    if (errorMessage) hide(errorMessage);

    try {
      // Fetch data for the FSA
      const resp = await fetch(`./data/${fsa}.json`, { cache: 'no-store' });
      if (!resp.ok) throw new Error('No data for this FSA');
      const data = await resp.json();

      // Store current FSA for later use
      window.currentFSA = fsa;

      // Process data and display results
      displayResults(fsa, data);
    } catch (err) {
      console.error('Error in loadReport:', err);
      displayNotInAreaMessage(fsa);
    }
  }

  // Display the results after a successful data fetch
  // Update displayResults to ensure proper sequencing
  function displayResults(fsa, data) {
    // Calculate counts
    const cutoff12 = getLast12MonthsCutoff();
    const cutoff30 = getLast30DaysCutoff();
    let count12 = 0, count30 = 0;
    
    (Array.isArray(data) ? data : []).forEach((e) => {
      const dt = parseDate(e && e.occurrence_date);
      if (!dt) return;
      if (dt >= cutoff12) count12++;
      if (dt >= cutoff30) count30++;
    });

    // Update headline with data
    const homeText = count12 === 1 ? 'Home' : 'Homes';
    resultsHeadline.textContent = `${count12} ${homeText} in ${fsa} Were Broken Into Last Year.`;
    if (resultsSubheadline) {
      resultsSubheadline.textContent = "See how to make yours impenetrable with our invisible security film.";
    }
    
    // Hide search container and show report container FIRST
    hide(searchContainer);
    show(reportContainer);
    
    // Render the dashboard
    renderDashboard(count12);
    
    // IMPORTANT: Small delay before showing map to ensure DOM is updated
    setTimeout(() => {
      // Now show map with data
      showMap(data);
      
      // Show other sections
      const videoSection = document.getElementById('video-section');
      const videoQuote = document.getElementById('video-quote');
      if (videoSection) show(videoSection);
      if (videoQuote) show(videoQuote);
    }, 100);
    
    // Update FSA in price check section
    setText(priceCheckFsa, fsa);
    
    // Show sticky footer after scrolling
    if (stickyFooter) {
      window.addEventListener('scroll', () => {
        const threshold = window.innerHeight + 250;
        if (window.scrollY > threshold) stickyFooter.classList.remove('hidden');
        else stickyFooter.classList.add('hidden');
      }, { passive: true });
    }
  }

  // Display "not in area" message when FSA isn't found
  function displayNotInAreaMessage(fsa) {
    // Hide search container
    hide(searchContainer);
    
    // Show not-in-area message in report container
    reportContainer.innerHTML = `
      <div class="mt-4">
        <h1 class="text-4xl font-bold text-[#0F2A3D] mb-4">We're Not in Your Area Just Yet</h1>
        <p class="text-gray-700 mb-6">
          While we don't cover ${fsa} today, we're expanding to new cities soon. Be the first to know when we launch in your neighbourhood!
        </p>
        <form id="email-form" class="flex flex-col gap-2">
          <label for="email-input" class="text-base font-medium text-gray-700">Email Address</label>
          <input type="email" id="email-input" name="email" required class="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full" placeholder="you@example.com">
          <div class="flex items-start gap-2 mt-2">
            <input type="checkbox" id="newsletter-checkbox-not-in-area" name="newsletter" value="subscribed" class="mt-1">
            <label for="newsletter-checkbox-not-in-area" class="text-sm text-gray-700">
              Yes, send me occasional emails from Window Guardian with security tips, news, and special offers. I know I can unsubscribe at any time.
            </label>
          </div>
          <div id="checkbox-error-not-in-area" class="text-red-500 text-sm mt-1" style="display:none;"></div>
          <button type="submit" class="bg-[#A06D36] mt-2 hover:bg-[#8C5F2F] text-white font-semibold px-6 py-2 rounded transition w-full">
            Notify Me
          </button>
        </form>
      </div>
    `;
    
    show(reportContainer);
    
    // Wire up not-in-area form
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
      const cb = document.getElementById('newsletter-checkbox-not-in-area');
      const cbErr = document.getElementById('checkbox-error-not-in-area');
      if (cb && cbErr) cb.addEventListener('change', () => hide(cbErr));
      
      emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email-input')?.value || '';
        const ok = document.getElementById('newsletter-checkbox-not-in-area')?.checked;
        
        if (!email) return;
        if (!ok && cbErr) {
          cbErr.textContent = 'Please check the box to agree to receive emails.';
          show(cbErr);
          return;
        }
        
        submitFS('notInArea', {
          email,
          newsletter: ok ? 'subscribed' : 'unsubscribed',
          fsa
        }).then(() => {
          emailForm.parentElement.innerHTML = `
            <h1 class="text-2xl font-bold text-[#0F2A3D] mb-4">You're On The List!</h1>
            <p class="text-gray-700 mb-6">
              We've added you to our notification list. You'll be the first to know when we launch in ${fsa}.
            </p>
            <button id="close-thank-you" class="bg-[#A06D36] hover:bg-[#8C5F2F] text-white font-semibold px-6 py-2 rounded transition">Close</button>
          `;
          document.getElementById('close-thank-you')?.addEventListener('click', () => location.reload());
        }).catch(() => alert('Sorry, there was an error submitting your request.'));
      });
    }
  }

  // Event listeners
  if (fsaInput && errorMessage) {
    fsaInput.addEventListener('input', () => hide(errorMessage));
  }
  
  if (fsaForm && fsaInput) {
    fsaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await loadReport(fsaInput.value);
    });
  }
  
  // Get quote button opens lead-gen overlay
  if (getFullQuoteBtn && leadGenOverlay) {
    getFullQuoteBtn.addEventListener('click', () => {
      leadGenOverlay.classList.remove('hidden');
    });
  }
  
  // Lead-gen form submission
  if (leadGenForm) {
    const cb = document.getElementById('newsletter-checkbox');
    const cbErr = document.getElementById('checkbox-error');
    
    if (cb && cbErr) cb.addEventListener('change', () => hide(cbErr));
    
    leadGenForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('name-input')?.value || '';
      const email = document.getElementById('email-input')?.value || '';
      const phone = document.getElementById('phone-input')?.value || '';
      const ok = document.getElementById('newsletter-checkbox')?.checked;
      
      if (!ok && cbErr) {
        cbErr.textContent = 'Please check the box to agree to receive emails.';
        show(cbErr);
        return;
      }
      
      hide(cbErr);
      
      submitFS('lead', {
        name, email, phone,
        newsletter: ok ? 'subscribed' : 'unsubscribed',
        fsa: window.currentFSA || 'N/A'
      }).then(() => {
        // Display thank you message
        const city = 'Vaughan';
        const now = new Date();
        const day = now.getDay(), hour = now.getHours();
        const isWeekend = day === 0 || day === 6;
        const isBusinessHours = !isWeekend && hour >= 9 && hour < 17;
        const nextBusinessDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][
          (day === 5 && hour >= 17) ? 1 : (day === 6) ? 1 : (day === 0) ? 1 : (hour >= 17 ? (day + 1) % 7 : day)
        ];
        
        const content = isBusinessHours
          ? `<h1 class="text-4xl font-bold text-[#0F2A3D] mb-4">Thank You! We've Received Your Request.</h1>
             <p class="text-gray-700 mb-6">A copy of your request has been sent to your email. One of our ${city} security experts will be in touch within the next few business hours.</p>`
          : `<h1 class="text-4xl font-bold text-[#0F2A3D] mb-4">Thank You! We've Received Your Request.</h1>
             <p class="text-gray-700 mb-4">A copy of your request has been sent to your email. We'll reach out on ${nextBusinessDay} morning to schedule your free consultation.</p>`;
             
        const overlayContent = document.querySelector('#lead-gen-overlay .overlay-content');
        if (overlayContent) {
          overlayContent.innerHTML = content;
          const btn = document.createElement('button');
          btn.textContent = 'Close';
          btn.className = 'bg-[#A06D36] hover:bg-[#8C5F2F] text-white font-semibold px-6 py-2 rounded transition';
          btn.addEventListener('click', () => leadGenOverlay?.classList.add('hidden'));
          overlayContent.appendChild(btn);
        }
      }).catch(() => alert('Sorry, there was an error submitting your request.'));
    });
  }

  // Check for FSA in URL parameters
  try {
    const params = new URLSearchParams(window.location.search);
    const fsaParam = params.get('fsa') || params.get('FSA');
    if (fsaParam && fsaInput) {
      fsaInput.value = String(fsaParam).toUpperCase();
      loadReport(fsaInput.value);
    }
  } catch { /* ignore */ }
});