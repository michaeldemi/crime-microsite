// main.js for break-in dashboard microsite
// Loads FSA data, shows dashboard and map

document.addEventListener('DOMContentLoaded', function() {
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

    fsaForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const fsa = fsaInput.value.trim().toUpperCase();
        if (!/^[A-Z][0-9][A-Z]$/.test(fsa)) {
            errorMessage.textContent = 'Please enter a valid FSA code (e.g., L4C)';
            errorMessage.style.display = 'block';
            return;
        }
        // Clear error if valid
        errorMessage.style.display = 'none';

        try {
            const resp = await fetch(`data/${fsa}.json`);
            if (!resp.ok) throw new Error('No data for this FSA');
            const data = await resp.json();
            if (data.length === 0) throw new Error('No data for this FSA');
            
            showDashboard(fsa, data);
            showMap(data);
            
            // Hide the single search container
            document.getElementById('search-container').style.display = 'none';
            
            document.getElementById('map-bg').style.backgroundImage = 'none';
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
            mapSection.style.display = 'none';
            if (window.leafletMap) {
                window.leafletMap.remove();
                window.leafletMap = null;
            }
        }
    });

    function showDashboard(fsa, data) { // Accept fsa here
        // Count break-ins last 30 days and last 12 months
        const now = new Date();
        const cutoff12 = getLast12MonthsCutoff();
        const cutoff30 = getLast30DaysCutoff();
        let count12 = 0, count30 = 0;
        data.forEach(entry => {
            if (!entry.date) return;
            const d = new Date(entry.date);
            if (d >= cutoff12) count12++;
            if (d >= cutoff30) count30++;
        });
        renderDashboard(fsa, count30, count12); // Pass fsa here

        // Find the most common municipality in the data
        let municipality = '';
        if (data.length > 0) {
            const counts = {};
            data.forEach(entry => {
                if (entry.municipality) {
                    counts[entry.municipality] = (counts[entry.municipality] || 0) + 1;
                }
            });
            municipality = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        }

        // Render the marketing message
        const marketing = document.getElementById('marketing-message');
        marketing.innerHTML = `
            <div class="text-left mt-4">
                <h3 class="text-xl font-bold text-gray-900 mb-2">Invisible Protection for Your Home's Weakest Point</h3>
                <p class="text-gray-700 text-base">
                    Our security film creates a powerful, shatter-resistant barrier on your glass doors and windows, the #1 entry point for break-ins in <span class="font-semibold">${municipality}</span>.
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
        marketing.style.display = '';

        // Handle "Secure My Free Quote" button click
        const quoteBtn = document.getElementById('quote-btn');
        if (quoteBtn) {
            quoteBtn.addEventListener('click', function() {
                const overlay = document.getElementById('lead-gen-overlay');
                overlay.classList.remove('hidden');
            });
        }

        // Optional: Close overlay when clicking outside
        document.getElementById('lead-gen-overlay').addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.add('hidden');
            }
        });
        
        window.municipality = municipality;
        window.currentFSA = fsa; // <-- ADD THIS LINE
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
                <h3 class="text-lg font-bold pt-2 sm:pt-4">${fsa.toUpperCase()} Break-in Report</h3>
            </div>
            <div class="flex flex-wrap items-center gap-x-1 text-sm mb-4">
                <span class="text-gray-400 text-xs">Updated ${formattedDate}</span>
                <span class="text-gray-400 text-xs">Source: York Regional Police</span>
            </div>
            <div class="flex flex-row flex-wrap gap-4 w-full mt-2">
                <div class="flex-1 bg-white-100 rounded-md p-3 text-black shadow-md text-left">
                    <div class="text-5xl text-[#4e9acd]">${count30}</div>
                    <div class="text-xs mt-1 text-gray-500">Last 30 Days</div>
                </div>
                <div class="flex-1 bg-white-100 rounded-md p-3 text-black shadow-md text-left">
                    <div class="text-5xl text-[#4e9acd]">${count12}</div>
                    <div class="text-xs mt-1 text-gray-500">Last 12 months</div>
                </div>
            </div>
        `;
        dashboard.style.display = '';
    }

    function showMap(data) {
        const mapDiv = document.getElementById('map');

        // Remove previous map if exists
        if (window.leafletMap) {
            window.leafletMap.remove();
            window.leafletMap = null;
        }

        // Filter for last 12 months and valid coordinates
        const cutoff12 = getLast12MonthsCutoff();
        const points = data.filter(entry =>
            entry.date && entry.lat && entry.lon && new Date(entry.date) >= cutoff12
        );

        // Fallback center
        let fallbackCenter = [43.8, -79.4];

        // Initialize map
        window.leafletMap = L.map('map').setView(fallbackCenter, 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(window.leafletMap);

        // Add markers and collect LatLngs
        const latlngs = [];
        points.forEach(entry => {
            const latlng = [entry.lat, entry.lon];
            latlngs.push(latlng);
            L.marker(latlng).addTo(window.leafletMap)
                .bindPopup(`${entry.municipality || ''}<br>${entry.date || ''}`);
        });

        // Fit map to bounds of all pins if there are any
        if (latlngs.length > 0) {
            const bounds = L.latLngBounds(latlngs);

            let padding;
            if (window.innerWidth >= 640) { // Desktop: pins in right 2/3
                const mapWidth = mapDiv.offsetWidth;
                padding = {
                    paddingTopLeft: [Math.round(mapWidth / 3), 20],
                    paddingBottomRight: [20, 20]
                };
            } else { // Mobile: pins in top 30%
                const mapHeight = mapDiv.offsetHeight;
                const mapWidth = mapDiv.offsetWidth;
                padding = {
                    paddingTopLeft: [Math.round(mapWidth * 0.05), Math.round(mapHeight * 0.10)],
                    paddingBottomRight: [Math.round(mapWidth * 0.05), Math.round(mapHeight * 0.60)]
                };
            }
            window.leafletMap.fitBounds(bounds, padding);

            // Force zoom to 14 on desktop
            if (window.innerWidth >= 640) {
                const center = bounds.getCenter();
                window.leafletMap.setView(center, 13);
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
                    fsa: window.currentFSA || 'N/A' // <-- ADD THIS LINE
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
