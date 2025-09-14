// main.js for break-in dashboard microsite
document.addEventListener('DOMContentLoaded', function () {
  // Detect page variant (matches index: sticky footer exists)
  const pageVersion = document.getElementById('sticky-quote-btn') ? 'Version B' : 'Version A';
  window.pageVersion = pageVersion;

  // Elements that exist in index-0.3.html
  const fsaForm = document.getElementById('fsa-form');
  const fsaInput = document.getElementById('fsa-input');
  const errorMessage = document.getElementById('error-message');
  const searchContainer = document.getElementById('search-container');
  const dashboardSection = document.getElementById('dashboard-section');
  const mapContainerCard = document.getElementById('map-container-card');
  const mapCanvas = document.getElementById('map-card');
  const socialProofSection = document.getElementById('social-proof-section');
  const faqSection = document.getElementById('faq-section');
  const stickyFooter = document.getElementById('sticky-footer');
  const stickyQuoteBtn = document.getElementById('sticky-quote-btn');
  const overlay = document.getElementById('lead-gen-overlay');
  const leadGenForm = document.getElementById('lead-gen-form');

  // Formspark endpoints (paste your real IDs here)
  const FORMSPARK = {
    lead: 'ZpsuLRXX7',        // Quote overlay form
    notInArea: 'YYyOI0pCQ',    // "Not in your area" form
    price1: 'XQZjL56XI',       // Price-check (top) form
    price2: 'XQZjL56XI'        // Price-check (below video) form
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

  // Utility
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

  // Dashboard render
  function renderDashboard(fsa, count30, count12) {
    if (!dashboardSection) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const updated = `${y}/${m}/${d}`;

    dashboardSection.innerHTML = `
      <div class="border-b border-gray-200 pb-4 sm:pb-2 w-full"></div>
      <div class="mb-0">
        <h1 class="text-2xl pt-2 sm:pt-4">${fsa.toUpperCase()} Break-in Report</h1>
      </div>
      <div class="flex flex-wrap items-center gap-x-1 text-sm mb-4">
        <span class="text-gray-400 text-xs">Updated ${updated}</span>
        <span class="text-gray-400 text-xs">Source: York Regional Police</span>
      </div>
      <div class="flex flex-row flex-wrap gap-4 w-full mt-2">
        <div class="flex-1 bg-white-100 rounded-md text-black text-left">
          <div class="text-3xl text-[#4e9acd] font-bold">${count30}</div>
          <div class="text-xs mt-1 text-gray-500">Last 30 Days</div>
        </div>
        <div class="flex-1 bg-white-100 rounded-md text-black text-left">
          <div class="text-3xl text-[#4e9acd] font-bold">${count12}</div>
          <div class="text-xs mt-1 text-gray-500">Last 12 months</div>
        </div>
      </div>
    `;
    show(dashboardSection);
  }

  // Map render (Leaflet)
  function showMap(data) {
    if (!mapCanvas) return;

    show(mapContainerCard);
    show(mapCanvas);

    if (window.leafletMap && typeof window.leafletMap.remove === 'function') {
      window.leafletMap.remove();
      window.leafletMap = null;
    }

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

    if (latlngs.length) {
      const bounds = L.latLngBounds(latlngs);
      window.leafletMap.fitBounds(bounds, { padding: [50, 50] });
    }

    // Card expand/collapse button (exists in index)
    const expandBtn = document.getElementById('map-expand-btn');
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
  }

  // Price-check sections (both)
  function showPriceCheckSections(fsa) {
    // Section 1
    const section1 = document.getElementById('price-check-section');
    const s1FormWrap = document.getElementById('price-check-form-container');
    const s1Table = document.getElementById('price-table-container');
    const s1FsaA = document.getElementById('price-check-fsa-1');
    const s1FsaB = document.getElementById('price-check-fsa-2');
    const s1Hidden = document.getElementById('price-check-fsa-hidden');

    if (section1) {
      show(section1);
      setText(s1FsaA, fsa);
      setText(s1FsaB, fsa);
      if (s1Hidden) s1Hidden.value = fsa;
    }
    const form1 = document.getElementById('price-check-form');
    if (form1) {
      form1.onsubmit = async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('price-check-email');
        const email = emailEl?.value?.trim() || '';
        const fsaVal = document.getElementById('price-check-fsa-hidden')?.value || (window.currentFSA || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          emailEl?.focus();
          return;
        }
        try {
          await submitFS('price1', {
            source: 'price-check-1',
            email,
            fsa: fsaVal,
            page: window.location.href,
            version: window.pageVersion || 'Unknown'
          });
        } catch (err) {
          console.error('Formspark price1 failed:', err);
        }
        show(s1Table);
        hide(s1FormWrap);
      };
    }

    // Section 2 (duplicate)
    const section2 = document.getElementById('price-check-section-2');
    const s2FormWrap = document.getElementById('price-check-form-container-2');
    const s2Table = document.getElementById('price-table-container-2');
    const s2FsaA = document.getElementById('price-check-fsa-1-2');
    const s2FsaB = document.getElementById('price-check-fsa-2-2');
    const s2Hidden = document.getElementById('price-check-fsa-hidden-2');

    if (section2) {
      show(section2);
      setText(s2FsaA, fsa);
      setText(s2FsaB, fsa);
      if (s2Hidden) s2Hidden.value = fsa;
    }
    const form2 = document.getElementById('price-check-form-2');
    if (form2) {
      form2.onsubmit = async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('price-check-email-2');
        const email = emailEl?.value?.trim() || '';
        const fsaVal = document.getElementById('price-check-fsa-hidden-2')?.value || (window.currentFSA || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          emailEl?.focus();
          return;
        }
        try {
          await submitFS('price2', {
            source: 'price-check-2',
            email,
            fsa: fsaVal,
            page: window.location.href,
            version: window.pageVersion || 'Unknown'
          });
        } catch (err) {
          console.error('Formspark price2 failed:', err);
        }
        show(s2Table);
        hide(s2FormWrap);
      };
    }
  }

  // Ensure hidden before valid FSA
  async function loadReport(rawFsa) {
    const vs = document.getElementById('video-section');
    const vq = document.getElementById('video-quote');
    const vb = document.getElementById('protection-benefits-section');
    if (vs) vs.style.display = 'none';
    if (vq) vq.style.display = 'none';
    if (vb) vb.style.display = 'none';

    // Keep these hidden until a valid FSA is loaded
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
      const resp = await fetch(`./data/${fsa}.json`, { cache: 'no-store' });
      if (!resp.ok) throw new Error('No data for this FSA');
      const data = await resp.json();

      window.currentFSA = fsa;

      hide(searchContainer);
      renderAndReveal(fsa, data);
    } catch (err) {
      console.error('Error in loadReport:', err);
      // Replace main content with "Not in Your Area" notice
      const mainCardContent = document.getElementById('main-card-content');
      if (mainCardContent) {
        mainCardContent.innerHTML = `
          <div class="border-b border-gray-200 pt-2 sm:pt-4 w-full"></div>
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
    }
  }

  function renderAndReveal(fsa, data) {
    // counts
    const cutoff12 = getLast12MonthsCutoff();
    const cutoff30 = getLast30DaysCutoff();
    let count12 = 0, count30 = 0;
    (Array.isArray(data) ? data : []).forEach((e) => {
      const dt = parseDate(e && e.occurrence_date);
      if (!dt) return;
      if (dt >= cutoff12) count12++;
      if (dt >= cutoff30) count30++;
    });

    // 1) Render the dashboard
    renderDashboard(fsa, count30, count12);

    // 2) Reveal the video section (Variant B only)
    showVideoSection(); // reveal quote + video (Variant B only)

    // 3) Continue with other sections
    showMap(data);
    showPriceCheckSections(fsa);
    show(socialProofSection);
    show(faqSection);
  }

  // Form interactions
  if (fsaInput && errorMessage) {
    fsaInput.addEventListener('input', () => hide(errorMessage));
  }
  if (fsaForm && fsaInput) {
    fsaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await loadReport(fsaInput.value);
    });
  }

  // Sticky footer
  if (stickyFooter) {
    stickyFooter.classList.add('hidden');
    window.addEventListener('scroll', () => {
      const threshold = window.innerHeight + 250;
      if (window.scrollY > threshold) stickyFooter.classList.remove('hidden');
      else stickyFooter.classList.add('hidden');
    }, { passive: true });
  }
  if (stickyQuoteBtn && overlay) {
    stickyQuoteBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
  }

  // Lead-gen submit (consent required)
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
        fsa: window.currentFSA || 'N/A',
        version: window.pageVersion || 'Unknown'
      }).then(() => {
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
             <p class="text-gray-700 mb-4">A copy of your request has been sent to your email. We’ll reach out on ${nextBusinessDay} morning to schedule your free consultation.</p>`;
        const overlayContent = document.querySelector('#lead-gen-overlay .overlay-content');
        if (overlayContent) {
          overlayContent.innerHTML = content;
          const btn = document.createElement('button');
          btn.textContent = 'Close';
          btn.className = 'bg-[#A06D36] hover:bg-[#8C5F2F] text-white font-semibold px-6 py-2 rounded transition';
          btn.addEventListener('click', () => overlay?.classList.add('hidden'));
          overlayContent.appendChild(btn);
        }
      }).catch(() => alert('Sorry, there was an error submitting your request.'));
    });
  }

  // URL param ?fsa=L4H
  try {
    const params = new URLSearchParams(window.location.search);
    const fsaParam = params.get('fsa') || params.get('FSA');
    if (fsaParam && fsaInput) {
      fsaInput.value = String(fsaParam).toUpperCase();
      loadReport(fsaInput.value);
    }
  } catch { /* ignore */ }

  // Reveal video+quote+benefits (Variant B only) and wire play
  function showVideoSection() {
    if (window.pageVersion !== 'Version B') return;

    const videoSection = document.getElementById('video-section');
    const video = document.getElementById('product-demo-video');
    const playBtn = document.getElementById('video-play-btn');

    if (videoSection) videoSection.style.display = '';

    // Ensure teaser plays muted/looping until user interacts
    if (video) {
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.play().catch(() => {});
    }

    // On click, switch to full video and play with sound
    if (playBtn && video) {
      playBtn.addEventListener('click', () => {
        // Swap source to the full video file
        const fullSrc = 'images/product-demo.mp4';
        try { video.pause(); } catch {}
        if (!video.src.includes('product-demo.mp4')) {
          video.src = fullSrc;
          try { video.load(); } catch {}
        }
        video.muted = false;
        video.loop = false;
        video.controls = true;
        video.play().catch(() => {});

        // Hide overlay button
        const overlay = playBtn.parentElement;
        if (overlay) overlay.style.display = 'none';
      }, { once: true });
    }

    document.getElementById('video-quote')?.style && (document.getElementById('video-quote').style.display = '');
    document.getElementById('protection-benefits-section')?.style && (document.getElementById('protection-benefits-section').style.display = '');
  }

  // Ensure this is called after renderDashboard in your render flow
  // e.g., inside renderAndReveal(...)
  // showVideoSection();
});
