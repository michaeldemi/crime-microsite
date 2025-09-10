// main.js for break-in dashboard microsite
// Loads FSA data, shows dashboard and map

document.addEventListener('DOMContentLoaded', function() {
    // At the top of your script, after variables declaration, add this:
    let pageVersion = "Version A"; // Default version
    
    // Detect if this is version B by checking for elements unique to that version
    if (document.getElementById('sticky-quote-btn')) {
        pageVersion = "Version B";
    }
    
    // Set this as a global variable for access in other functions
    window.pageVersion = pageVersion;

    // --- UPDATED: Check for URL parameter with case-insensitive handling ---
    const urlParams = new URLSearchParams(window.location.search);
    // Look for both lowercase 'fsa' and uppercase 'FSA' parameters
    const fsaFromUrl = urlParams.get('fsa') || urlParams.get('FSA');
    
    if (fsaFromUrl) {
        // Automatically load the report if the FSA is in the URL
        loadReport(fsaFromUrl.trim().toUpperCase());
        
        // Also update the input field to show the FSA code
        const fsaInput = document.getElementById('fsa-input');
        if (fsaInput) {
            fsaInput.value = fsaFromUrl.trim().toUpperCase();
        }
    }
    
    const fsaForm = document.getElementById('fsa-form');
    const fsaInput = document.getElementById('fsa-input');
    const errorMessage = document.getElementById('error-message'); // Add this
    const dashboardSection = document.getElementById('dashboard-section');
    const mapSection = document.getElementById('map-section');
    let leafletMap = null;
    let markersLayer = null;

    function getLast12MonthsCutoff() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
    }
    function getLast30DaysCutoff() {
        const now = new Date();
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Hide error on input
    fsaInput.addEventListener('input', function() {
        errorMessage.style.display = 'none';
    });

    // --- NEW: Reusable function to load the report ---
    async function loadReport(fsa) {
        if (!/^[A-Z][0-9][A-Z]$/.test(fsa)) {
            errorMessage.textContent = 'Please enter a valid FSA code (e.g., L4C)';
            errorMessage.style.display = 'block';
            return;
        }
        // Clear error if valid
        errorMessage.style.display = 'none';

        try {
            // CHANGE THIS LINE - Use a relative path that works both locally and on GitHub
            const resp = await fetch(`./data/${fsa}.json`);
            if (!resp.ok) throw new Error('No data for this FSA');
            const data = await resp.json();
            if (data.length === 0) throw new Error('No data for this FSA');
            
            showDashboard(fsa, data);
            showMap(data);
            
            const searchContainer = document.getElementById('search-container');
            if (searchContainer) {
                searchContainer.style.display = 'none';
            }

            const mainCardContent = document.getElementById('main-card-content');
            if (mainCardContent) {
                mainCardContent.classList.add('overflow-y-auto');
            }

            // --- FIX: Check if map-bg exists before changing its style ---
            const mapBg = document.getElementById('map-bg');
            if (mapBg) {
                mapBg.style.backgroundImage = 'none';
            }
        } catch (err) {
            // Find the main content container
            const mainCardContent = document.getElementById('main-card-content');

            // Replace its entire content with the "Not in Your Area" message
            mainCardContent.innerHTML = `
                <div class="border-b border-gray-200 pt-2 sm:pt-4 w-full"></div>
                <div class="mt-4">
                    <h1 class="text-4xl font-bold text-[#0F2A3D] mb-4">We're Not in Your Area Just Yet</h1>
                    <p class="text-gray-700 mb-6">
                        While we don't cover ${fsa.toUpperCase()} today, we're expanding to new cities soon. Be the first to know when we launch in your neighbourhood!
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

            // Add submit handler for the email form
            const emailForm = document.getElementById('email-form');
            if (emailForm) {
                // Hide checkbox error when checkbox is checked
                document.getElementById('newsletter-checkbox-not-in-area').addEventListener('change', function() {
                    document.getElementById('checkbox-error-not-in-area').style.display = 'none';
                });

                emailForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    // Get email value
                    const email = document.getElementById('email-input').value;
                    
                    // Get checkbox value
                    const newsletter = document.getElementById('newsletter-checkbox-not-in-area').checked;
                    
                    // Basic validation (email is required by HTML, but double-check)
                    if (!email) {
                        alert('Please enter a valid email address.');
                        return;
                    }
                    
                    // Validate checkbox
                    if (!newsletter) {
                        document.getElementById('checkbox-error-not-in-area').textContent = 'Please check the box to agree to receive emails.';
                        document.getElementById('checkbox-error-not-in-area').style.display = 'block';
                        return; // Prevent submission
                    }
                    
                    // Clear any previous error
                    document.getElementById('checkbox-error-not-in-area').style.display = 'none';
                    
                    // Submit to Formcarry
                    fetch('https://formcarry.com/s/T9WD2WnamXJ', { // <-- PASTE YOUR URL HERE
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            email: document.getElementById('email-input').value,
                            newsletter: document.getElementById('newsletter-checkbox-not-in-area').checked ? 'subscribed' : 'unsubscribed',
                            fsa: fsa // Include the FSA the user entered
                        })
                    })
                    .then(response => {
                        // --- The rest of your code to show the thank you message ---
                        const formContainer = emailForm.parentElement;
                        formContainer.innerHTML = `
                            <h1 class="text-2xl font-bold text-[#0F2A3D] mb-4">You're On The List!</h1>
                            <p class="text-gray-700 mb-6">
                                We've added you to our notification list. You'll be the first to know when we launch in ${fsa.toUpperCase()}.
                            </p>
                            <button id="close-thank-you" class="bg-[#A06D36] hover:bg-[#8C5F2F] text-white font-semibold px-6 py-2 rounded transition">
                                Close
                            </button>
                        `;
                        document.getElementById('close-thank-you').addEventListener('click', () => location.reload());
                    })
                    .catch(error => {
                        console.error(error);
                        alert('Sorry, there was an error submitting your request.');
                    });
                });
            }

            // Hide the map and clean up
            // --- FIX: Check if mapSection exists before using it ---
            if (mapSection) {
                mapSection.style.display = 'none';
            }
            if (window.leafletMap) {
                window.leafletMap.remove();
                window.leafletMap = null;
            }
        }
    }

    // ==================================================
    //  START: MOVE THIS BLOCK FROM THE TOP TO THE BOTTOM
    // ==================================================
    // --- MODIFIED: Form submission now calls the reusable function ---
    fsaForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const fsa = fsaInput.value.trim().toUpperCase();
        await loadReport(fsa);
    });
    // ==================================================
    //  END: MOVE THIS BLOCK
    // ==================================================

    function showDashboard(fsa, data, municipality) { // Accept municipality
        // Count break-ins last 30 days and last 12 months
        const cutoff12 = getLast12MonthsCutoff();
        const cutoff30 = getLast30DaysCutoff();
        let count12 = 0, count30 = 0;
        data.forEach(entry => {
            if (!entry.occurrence_date) return;
            
            const d = new Date(entry.occurrence_date.replace(' ', 'T'));
            
            if (!isNaN(d)) {
                if (d >= cutoff12) count12++;
                if (d >= cutoff30) count30++;
            }
        });
        renderDashboard(fsa, count30, count12);

        // Render the marketing message
        const marketing = document.getElementById('marketing-message');
        
        // --- VERSION B LOGIC (sticky footer) ---
        const stickyQuoteBtn = document.getElementById('sticky-quote-btn');
        if (stickyQuoteBtn) {
            marketing.innerHTML = `
                <div class="text-left mt-4">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Invisible Protection for Your Home's Weakest Point</h2>
                    <p class="text-gray-700 text-base">
                        Most forced entries target ground-floor glass—our security film adds a shatter-resistant layer that buys you time.
                    </p>
                    <ul class="mt-2 space-y-1 text-gray-700 text-base">
                        <li>🛡️ Shatter-Resistant Glass</li>
                        <li>⏰ Buys Critical Time</li>
                        <li>👨‍👩‍👧‍👦 Keeps Family Safe</li>
                    </ul>
                </div>
            `;
            stickyQuoteBtn.addEventListener('click', () => document.getElementById('lead-gen-overlay').classList.remove('hidden'));
            const stickyFooter = document.getElementById('sticky-footer');
            if(stickyFooter) stickyFooter.classList.remove('hidden');
            
            // NEW: Show video section in version B
            const videoSection = document.getElementById('video-section');
            if (videoSection) {
                videoSection.style.display = 'block';
                
                // Add click handler for play button
                const playBtn = document.getElementById('video-play-btn');
                if (playBtn) {
                    playBtn.addEventListener('click', function() {
                        // Replace the image and play button with a video player
                        const videoContainer = this.closest('.relative');
                        if (videoContainer) {
                            videoContainer.innerHTML = `
                                <video 
                                    class="w-full h-full object-cover" 
                                    controls 
                                    autoplay
                                    src="/images/product-demo.mp4">
                                    Your browser does not support the video tag.
                                </video>
                            `;
                        }
                    });
                }
            }
        } 
        // --- VERSION A LOGIC (original inline button) ---
        else {
            marketing.innerHTML = `
                <div class="text-left mt-4">
                    <h3 class="text-xl font-bold text-gray-900 mb-2">Invisible Protection for Your Home's Weakest Point</h3>
                    <p class="text-gray-700 text-base">
                        Reinforce your glass doors and windows—<span class="font-semibold">${municipality}</span>'s #1 break-in point—with our shatter-resistant security film.
                    </p>
                    <ul class="mt-2 space-y-1 text-gray-700 text-base">
                        <li>🛡️ Shatter-Resistant Glass</li>
                        <li>⏰ Buys Critical Time</li>
                        <li>👨‍👩‍👧‍👦 Keeps Family Safe</li>
                    </ul>
                    <button id="quote-btn" class="mt-6 w-full bg-[#A06D36] hover:bg-[#8C5F2F] text-white font-semibold py-3 rounded-lg shadow transition">
                        Secure My Free Quote
                    </button>
                </div>
            `;
            const quoteBtn = document.getElementById('quote-btn');
            if (quoteBtn) {
                quoteBtn.addEventListener('click', () => document.getElementById('lead-gen-overlay').classList.remove('hidden'));
            }
        }
        marketing.style.display = '';

        // Optional: Close overlay when clicking outside
        const leadGenOverlay = document.getElementById('lead-gen-overlay');
        if (leadGenOverlay) {
            leadGenOverlay.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.add('hidden');
                }
            });
        }
        
        window.municipality = municipality;
        window.currentFSA = fsa;

        // --- Show FAQ section after dashboard loads ---
        const faqSection = document.getElementById('faq-section');
        if (faqSection) {
            faqSection.style.display = 'block';
        }

        // --- NEW: Show social proof section after dashboard loads ---
        const socialProofSection = document.getElementById('social-proof-section');
        if (socialProofSection) {
            socialProofSection.style.display = 'block';
        }

        // --- NEW: Show protection options section after dashboard loads ---
        const protectionSection = document.getElementById('protection-options-section');
        if (protectionSection) {
            // Update the FSA placeholder dynamically
            const fsaPlaceholder = document.getElementById('fsa-placeholder');
            if (fsaPlaceholder) {
                fsaPlaceholder.textContent = fsa.toUpperCase();
            }
            protectionSection.style.display = 'block';

            // Handle "See My Range" button click
            const seeRangeBtn = document.getElementById('see-range-btn');
            if (seeRangeBtn) {
                seeRangeBtn.addEventListener('click', function() {
                    const selectedOptions = Array.from(document.querySelectorAll('#protection-form input[name="protection"]:checked')).map(cb => cb.value);
                    console.log('Selected protection options:', selectedOptions);

                    // --- NEW: Show error message if no selection is made ---
                    if (selectedOptions.length === 0) {
                        // Create or update the error message
                        let errorMsg = document.getElementById('protection-error-message');
                        if (!errorMsg) {
                            errorMsg = document.createElement('div');
                            errorMsg.id = 'protection-error-message';
                            errorMsg.className = 'text-red-600 text-sm mt-2 animate-pulse';
                            const formElement = document.getElementById('protection-form');
                            // Insert error message after the checkbox grid but before the button
                            formElement.querySelector('.grid').insertAdjacentElement('afterend', errorMsg);
                        }
                        errorMsg.textContent = '⚠️ Please select at least one area to protect';
                        
                        // Clear error after 5 seconds
                        setTimeout(() => {
                            if (errorMsg) errorMsg.textContent = '';
                        }, 5000);
                        
                        return; // Stop execution if no options selected
                    } else {
                        // Clear any existing error message
                        const errorMsg = document.getElementById('protection-error-message');
                        if (errorMsg) errorMsg.textContent = '';
                    }

                    // --- NEW: Calculate prices based on selections ---
                    let minPrice = 0;
                    let maxPrice = 0;
                    let priceLabel = '';
                    
                    // If "whole-home" is selected, use that price range regardless of other selections
                    if (selectedOptions.includes('whole-home')) {
                        minPrice = 1300;
                        maxPrice = 2900;
                        priceLabel = 'Whole Home Protection';
                    } else {
                        // Otherwise calculate based on individual selections
                        if (selectedOptions.includes('patio-door')) {
                            minPrice += 500;
                            maxPrice += 500;
                        }
                        
                        if (selectedOptions.includes('front-sidelites')) {
                            minPrice += 400;
                            maxPrice += 400;
                        }
                        
                        if (selectedOptions.includes('basement-windows')) {
                            minPrice += 300;
                            maxPrice += 500;
                        }
                        
                        // Create label based on selected items
                        const labelParts = [];
                        if (selectedOptions.includes('patio-door')) labelParts.push('Patio Door');
                        if (selectedOptions.includes('front-sidelites')) labelParts.push('Front Sidelites');
                        if (selectedOptions.includes('basement-windows')) labelParts.push('Basement');
                        
                        priceLabel = labelParts.join(' + ');
                    }
                    
                    // Format prices and create price display text
                    const formattedMinPrice = minPrice.toLocaleString('en-US');
                    const formattedMaxPrice = maxPrice.toLocaleString('en-US');
                    const priceDisplay = minPrice === maxPrice ? 
                        `$${formattedMinPrice}` : 
                        `$${formattedMinPrice} - $${formattedMaxPrice}`;

                    // --- NEW: Show the price range section ---
                    const priceRangeSection = document.getElementById('price-range-section');
                    if (priceRangeSection && selectedOptions.length > 0) {
                        // Update the FSA in the price range headline
                        const priceRangeFsa = document.getElementById('price-range-fsa');
                        if (priceRangeFsa) {
                            priceRangeFsa.textContent = fsa.toUpperCase();
                        }
                        
                        // Replace the previous house-type price table with our calculated price
                        const priceContent = `
                        <div class="space-y-4">
                            <div class="bg-white p-4 rounded-md shadow-sm border border-gray-200">
                                <div class="grid grid-cols-2 gap-4 items-center mb-4">
                                    <div class="font-medium text-gray-800">${priceLabel}</div>
                                    <div class="text-right font-semibold text-[#0F2A3D]">${priceDisplay}</div>
                                </div>
                                
                                <!-- Bullet points inside the card -->
                                <ul class="mt-4 space-y-2 text-sm text-gray-600 border-t border-gray-100 pt-4">
                                    <li class="flex items-center gap-2">
                                        <svg class="h-4 w-4 text-green-500 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                        <span>Professional install, licensed & insured</span>
                                    </li>
                                    <li class="flex items-center gap-2">
                                        <svg class="h-4 w-4 text-green-500 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                        <span>Includes manufacturer warranty (up to 10 yrs)</span>
                                    </li>
                                    <li class="flex items-center gap-2">
                                        <svg class="h-4 w-4 text-green-500 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                        <span>Most installs done in a day</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        `;
                        
                        // Replace the entire space-y-4 div with our new content
                        const priceTableContainer = priceRangeSection.querySelector('.space-y-4');
                        if (priceTableContainer) {
                            priceTableContainer.outerHTML = priceContent;
                        }
                        
                        priceRangeSection.style.display = 'block';

                        // Add event listener for the CTA button
                        const tailoredQuoteBtn = document.getElementById('tailored-quote-btn');
                        if (tailoredQuoteBtn) {
                            tailoredQuoteBtn.addEventListener('click', function() {
                                document.getElementById('lead-gen-overlay').classList.remove('hidden');
                            });
                        }
                    }
                });
            }
        }
    }

    function renderDashboard(fsa, count30, count12) {
        const dashboard = document.getElementById('dashboard-section');

        // Get today's date and format it
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${year}/${month}/${day}`;

        dashboard.innerHTML = `
            <div class="border-b border-gray-200 pb-4 sm:pb-2 w-full"></div>    
            <div class="mb-0">
                <h1 class="text-2xl  pt-2 sm:pt-4">${fsa.toUpperCase()} Break-in Report</h3>
            </div>
            <div class="flex flex-wrap items-center gap-x-1 text-sm mb-4">
                <span class="text-gray-400 text-xs">Updated ${formattedDate}</span>
                <span class="text-gray-400 text-xs">Source: York Regional Police</span>
            </div>
            <div class="flex flex-row flex-wrap gap-4 w-full mt-2">
                <div class="flex-1 bg-white-100 rounded-md p-3 text-black shadow-md text-left">
                    <div class="text-3xl text-[#4e9acd] font-bold">${count30}</div>
                    <div class="text-xs mt-1 text-gray-500">Last 30 Days</div>
                </div>
                <div class="flex-1 bg-white-100 rounded-md p-3 text-black shadow-md text-left">
                    <div class="text-3xl text-[#4e9acd] font-bold">${count12}</div>
                    <div class="text-xs mt-1 text-gray-500">Last 12 months</div>
                </div>
            </div>
        `;
        dashboard.style.display = '';
    }

    function showMap(data) {
        const mapContainerCard = document.getElementById('map-container-card');
        const mapSection = document.getElementById('map-section'); // The original map container

        // Filter points once
        const cutoff12 = getLast12MonthsCutoff();
        const points = data.filter(entry => {
            if (!entry.occurrence_date || !entry.latitude || !entry.longitude) return false;
            const d = new Date(entry.occurrence_date.replace(' ', 'T'));
            return !isNaN(d) && d >= cutoff12;
        });

        // Remove previous map if it exists
        if (window.leafletMap) {
            window.leafletMap.remove();
            window.leafletMap = null;
        }

        // --- VERSION B LOGIC (in-card map) ---
        if (mapContainerCard) {
            mapContainerCard.style.display = 'block';
            window.leafletMap = L.map('map-card').setView([43.8, -79.4], 11);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(window.leafletMap);

            const latlngs = [];
            points.forEach(point => {
                const latlng = [point.latitude, point.longitude];
                L.marker(latlng).addTo(window.leafletMap);
                latlngs.push(latlng);
            });

            if (latlngs.length > 0) {
                const bounds = L.latLngBounds(latlngs);
                window.leafletMap.fitBounds(bounds, { padding: [50, 50] });
            }

            // Handle map expansion
            const expandBtn = document.getElementById('map-expand-btn');
            const expandIcon = document.getElementById('map-expand-icon');
            const collapseIcon = document.getElementById('map-collapse-icon');

            if (expandBtn) {
                expandBtn.addEventListener('click', () => {
                    const isExpanded = mapContainerCard.style.height === '600px';
                    mapContainerCard.style.height = isExpanded ? '200px' : '600px';
                    expandIcon.classList.toggle('hidden', !isExpanded);
                    collapseIcon.classList.toggle('hidden', isExpanded);
                    setTimeout(() => window.leafletMap.invalidateSize(), 500);
                });
            }
        } 
        // --- VERSION A LOGIC (original background map) ---
        else if (mapSection) {
            mapSection.style.display = 'block';
            window.leafletMap = L.map('map-section').setView([43.8, -79.4], 11);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(window.leafletMap);

            const latlngs = [];
            points.forEach(point => {
                const latlng = [point.latitude, point.longitude];
                L.marker(latlng).addTo(window.leafletMap);
                latlngs.push(latlng);
            });

            if (latlngs.length > 0) {
                const bounds = L.latLngBounds(latlngs);
                // Use padding that accounts for the card on the left
                window.leafletMap.fitBounds(bounds, { paddingTopLeft: [500, 50], paddingBottomRight: [50, 50] });
            }
        }
    }

    // Function to get the next business day
    function getNextBusinessDay() {
        const now = new Date();
        const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const hour = now.getHours();
        let nextDay;
        
        if (day === 5 && hour >= 17) { // Fri after 5 PM
            nextDay = 1; // Monday
        } else if (day === 6) { // Saturday
            nextDay = 1; // Monday
        } else if (day === 0) { // Sunday
            nextDay = 1; // Monday
        } else if (hour >= 17) { // Weekday after 5 PM (Mon-Thu)
            nextDay = (day + 1) % 7;
            if (nextDay === 0) nextDay = 1; // If next is Sunday, make it Monday
        } else {
            return null; // During business hours, no "next" day needed
        }
        
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[nextDay];
    }

    // Handle lead-gen form submission
    const leadGenForm = document.getElementById('lead-gen-form');
    if (leadGenForm) {
        // Hide checkbox error when checkbox is checked
        document.getElementById('newsletter-checkbox').addEventListener('change', function() {
            console.log('Checkbox changed, hiding error');
            document.getElementById('checkbox-error').style.display = 'none';
        });

        leadGenForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values (optional: send to backend)
            const name = document.getElementById('name-input').value;
            const email = document.getElementById('email-input').value;
            const phone = document.getElementById('phone-input').value;
            const newsletter = document.getElementById('newsletter-checkbox').checked;
            if (!newsletter) {
                document.getElementById('checkbox-error').textContent = 'Please check the box to agree to receive emails.';
                document.getElementById('checkbox-error').style.display = 'block';
                return; // Prevent submission
            }
            
            // Clear any previous error
            document.getElementById('checkbox-error').style.display = 'none';
            
            // ==================================================
            //  START: MOVE THE FETCH CALL TO HERE
            // ==================================================
            fetch('https://formcarry.com/s/T9WD2WnamXJ', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    name: document.getElementById('name-input').value,
                    email: document.getElementById('email-input').value,
                    phone: document.getElementById('phone-input').value,
                    newsletter: document.getElementById('newsletter-checkbox').checked ? 'subscribed' : 'unsubscribed',
                    fsa: window.currentFSA || 'N/A',
                    version: window.pageVersion || 'Unknown' // Add the version identifier
                })
            })
            .then(response => {
                // If the submission is successful, show the thank you message.
                // This code was already here, just make sure it's inside the .then()
                const now = new Date();
                const day = now.getDay();
                const hour = now.getHours();
                const isWeekend = day === 0 || day === 6;
                const isAfter5 = hour >= 17;
                const isBusinessHours = !isWeekend && hour >= 9 && hour < 17 && !isAfter5;
                const city = window.municipality || 'Vaughan';
                
                let messageHTML;
                if (isBusinessHours) {
                    messageHTML = `
                        <h1 class="text-4xl font-bold text-[#0F2A3D] mb-4">Thank You! We've Received Your Request.</h1>
                        <p class="text-gray-700 mb-6">
                            A copy of your request has been sent to your email. One of our ${city} security experts is reviewing your information and will be in touch within the next few business hours to schedule your free, no-obligation consultation.
                        </p>
                    `;
                } else {
                    const nextBusinessDay = getNextBusinessDay();
                    messageHTML = `
                        <h1 class="text-4xl font-bold text-[#0F2A3D] mb-4">Thank You! We've Received Your Request.</h1>
                        <p class="text-gray-700 mb-4">
                            A copy of your request has been sent to your email. Since our office is currently closed for the weekend, one of our ${city} security experts will be in touch first thing on ${nextBusinessDay} morning to schedule your free, no-obligation consultation.
                        </p>
                    `;
                }
                
                const overlayContent = document.querySelector('#lead-gen-overlay .overlay-content');
                overlayContent.innerHTML = messageHTML;
                
                const closeButton = document.createElement('button');
                closeButton.textContent = 'Close';
                closeButton.className = 'bg-[#A06D36] hover:bg-[#8C5F2F] text-white font-semibold px-6 py-2 rounded transition';
                closeButton.addEventListener('click', function() {
                    document.getElementById('lead-gen-overlay').classList.add('hidden');
                    // Optional: Reset the overlay content for future use
                    location.reload(); // Or reset the HTML manually
                });
                overlayContent.appendChild(closeButton);
            })
            .catch(error => {
                console.error(error);
                alert('Sorry, there was an error submitting your request.');
            });
            // ==================================================
            //  END: MOVE THE FETCH CALL
            // ==================================================
        });
    }



});
