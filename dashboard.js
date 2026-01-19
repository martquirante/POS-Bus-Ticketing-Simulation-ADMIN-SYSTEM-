import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update, push, remove, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ==========================================================================================
// 🔴 PART 1: FIREBASE CONFIGURATION & SYSTEM SETUP
// ==========================================================================================
// Boss, let's verify your Firebase credentials are correct
const firebaseConfig = {
    apiKey: "AIzaSyAkpVAHRYYyp6xubi6Mt9zhX9zDBRVrjVA",
    authDomain: "santranspos.firebasestorage.app",
    databaseURL: "https://santranspos-default-rtdb.firebaseio.com",
    projectId: "santranspos",
    storageBucket: "santranspos.firebasestorage.app",
    messagingSenderId: "1070508476864",
    appId: "1:1070508476864:web:5af5934ad86088617da025"
};

// Initialize Firebase Application
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Connection Test - Very important!
const connectedRef = ref(db, ".info/connected");
onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        console.log("✅ CONNECTED TO FIREBASE!");
        showToast("Firebase: Connected", "success");
    } else {
        console.warn("❌ DISCONNECTED FROM FIREBASE.");
        showToast("Firebase: Disconnected", "error");
    }
});

// ==========================================================================================
// 🌍 PART 2: GLOBAL STATE MANAGEMENT (Variables we'll use)
// ==========================================================================================
let currentRoutePath = 'Routes_Forward'; 
let mapInstance = null;         // Live Fleet Map
let configMapInstance = null;   // Route Editor Map
let busMarkers = {};            // Object for bus icons on map
let trafficLayer = null;        // Google Traffic Layer

// Route Plotting Variables (Blue Line Visuals)
let routePoints = [];   
let routeMarkers = [];  
let currentRouteLayer = null; 

// Charts Instances (for real-time updates)
let mainChart = null;       
let routeChart = null;      
let paymentChart = null;    

// Audio Context for Emergency Alarm
let audioCtx = null;
let oscillator = null;
let isAlarmPlaying = false;
let lastRefreshTime = null;
let searchDebounceTimer = null;

// Global bus list for modal access
window.currentBusList = [];

// ==========================================================================================
// 🔐 PART 3: SYSTEM INITIALIZATION (ON LOAD)
// ==========================================================================================
document.addEventListener("DOMContentLoaded", () => {
    console.log("📱 Dashboard Initializing...");
    
    // 1. Check Session (Security Check) - See if already logged in
    const session = localStorage.getItem("dashboardSession");
    const loginModal = document.getElementById("loginModal");
    
    if (session) {
        console.log("✅ User session found:", session);
        if(loginModal) loginModal.style.display = "none"; // Hide login modal
        const nameDisplay = document.getElementById("adminNameDisplay");
        if(nameDisplay) nameDisplay.innerText = session;
        
        // Welcome toast para sosyal
        showToast(`Welcome back, ${session}!`, "success");
    } else {
        console.log("❌ No session found, showing login");
        if(loginModal) loginModal.style.display = "flex"; // Show login modal
    }
    
    // 2. Setup Date & Time Display
    updateDateTimeDisplay();
    setInterval(updateDateTimeDisplay, 60000); // Update every minute

    // 3. Setup Notification System (Bell Icon)
    setupNotificationSystem();

    // 4. Setup Dark/Light Mode Theme
    setupThemeSwitcher();

    // 5. Setup Search Suggestions
    setupSearchSuggestions();

    // 6. Initialize Maps & Charts (Late init to ensure DOM is loaded)
    setTimeout(() => {
        initMaps();
        initCharts();
        loadRoutes(); // Load routes initially
        setupBusSearchAutocomplete(); // Setup bus search with autocomplete
        
        // Start real-time Firebase listener
        startFirebaseListener();
        
        showToast("✅ Dashboard initialized successfully!", "success");
    }, 500);
    
    // 7. Setup Window Resize Handling for responsiveness
    setupResponsiveHandling();
});

// Function to update date and time display
function updateDateTimeDisplay() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('en-PH', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Update the date display element
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.innerHTML = `<i class="far fa-calendar-alt me-1"></i> ${dateStr} • ${timeStr}`;
    }
    
    // Update last refresh time
    lastRefreshTime = now;
    const lastRefreshEl = document.getElementById('lastRefreshTime');
    if (lastRefreshEl) {
        lastRefreshEl.innerHTML = `<i class="fas fa-sync-alt"></i> Updated: ${timeStr}`;
    }
}

// Function to setup theme switcher
function setupThemeSwitcher() {
    const themeToggle = document.getElementById('darkModeToggle');
    const currentTheme = localStorage.getItem('theme');

    // Apply saved theme
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.checked = true;
        updateChartTheme(true); // Update charts to dark mode colors
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.checked = false;
        updateChartTheme(false);
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                showToast("🌙 Dark Mode Activated", "success");
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                showToast("☀️ Light Mode Activated", "success");
            }
            updateChartTheme(isDark); // Refresh charts colors
        });
    }
}

// Function to setup responsive handling
function setupResponsiveHandling() {
    // Handle window resize for map
    window.addEventListener('resize', function() {
        if (mapInstance) {
            setTimeout(() => {
                mapInstance.invalidateSize();
            }, 300);
        }
        if (configMapInstance) {
            setTimeout(() => {
                configMapInstance.invalidateSize();
            }, 300);
        }
        
        // Auto-close sidebar on mobile when resizing
        if (window.innerWidth < 992) {
            document.querySelector('.sidebar')?.classList.remove('mobile-open');
        }
    });
    
    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('sidebarToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('mobile-open');
        });
    }
}

// ==========================================================================================
// 🔍 PART 4: SEARCH SUGGESTIONS SYSTEM
// ==========================================================================================
function setupSearchSuggestions() {
    // List of inputs that need suggestions
    const inputs = [
        { id: 'searchLocInput', type: 'location' },
        { id: 'routeFromModal', type: 'location' },
        { id: 'routeToModal', type: 'location' }
    ];

    inputs.forEach(item => {
        const input = document.getElementById(item.id);
        if(!input) return;

        // Create dropdown suggestion box
        const box = document.createElement('div');
        box.className = 'search-suggestion-box glass-effect';
        box.style.display = 'none';
        box.style.position = 'absolute';
        box.style.zIndex = '1000';
        box.style.width = '100%';
        box.style.background = 'var(--card-bg)';
        box.style.border = '1px solid var(--border-color)';
        box.style.borderRadius = '8px';
        box.style.maxHeight = '200px';
        box.style.overflowY = 'auto';
        box.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
        
        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(box);

        input.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchDebounceTimer);
            
            if(query.length < 3) {
                box.style.display = 'none';
                return;
            }

            searchDebounceTimer = setTimeout(() => {
                box.innerHTML = `<div class="p-2 text-muted small"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;
                box.style.display = 'block';

                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=5`)
                .then(res => res.json())
                .then(data => {
                    box.innerHTML = "";
                    if(data.length === 0) {
                        box.innerHTML = `<div class="p-2 text-muted small">No results found.</div>`;
                    } else {
                        data.forEach(loc => {
                            const div = document.createElement('div');
                            div.className = 'p-2 border-bottom suggestion-item';
                            div.style.cursor = 'pointer';
                            div.innerHTML = `<i class="fas fa-map-marker-alt text-danger me-2"></i> ${loc.display_name.split(',')[0]}`;
                            div.onclick = () => {
                                input.value = loc.display_name.split(',')[0]; // Short name only
                                box.style.display = 'none';
                                
                                // If it's the map search, center on that location
                                if(item.id === 'searchLocInput' && configMapInstance) {
                                    configMapInstance.flyTo([loc.lat, loc.lon], 16);
                                    L.marker([loc.lat, loc.lon], {
                                        icon: L.icon({
                                            iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
                                            iconSize: [35, 35]
                                        })
                                    }).addTo(configMapInstance).bindPopup(input.value).openPopup();
                                }
                            };
                            box.appendChild(div);
                        });
                    }
                })
                .catch(err => {
                    box.innerHTML = `<div class="p-2 text-muted small">Search service unavailable</div>`;
                });
            }, 300);
        });
        
        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if(!input.contains(e.target) && !box.contains(e.target)) {
                box.style.display = 'none';
            }
        });
    });
}

// ==========================================================================================
// 🔑 PART 5: LOGIN SYSTEM - IMPROVED
// ==========================================================================================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPass').value.trim();
        const btn = loginForm.querySelector('button');
        
        if(!email || !pass) {
            showToast("Please enter email and password.", "warning");
            return;
        }

        // UI Loading State
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking...`;
        btn.disabled = true;

        const safeUser = email.replace(/\./g, '_');

        get(ref(db, `SuperAdmins/${safeUser}`)).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.password === pass) {
                    localStorage.setItem("dashboardSession", data.name);
                    showToast(`Welcome back, ${data.name}!`, "success");
                    setTimeout(() => location.reload(), 1500);
                } else {
                    showToast("❌ Incorrect password!", "error");
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            } else {
                // Hardcoded fallback for quick access
                if(email === "admin@santrans.com" && pass === "admin123") {
                    localStorage.setItem("dashboardSession", "System Owner");
                    showToast("Welcome, System Owner!", "success");
                    setTimeout(() => location.reload(), 1500);
                } else {
                    showToast("❌ Account not found.", "error");
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            }
        }).catch(err => {
            showToast("Login Error: " + err.message, "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    });
}

// Logout Function - Enhanced
window.logout = () => {
    if(confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("dashboardSession");
        showToast("✅ Logged out successfully", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

// ==========================================================================================
// 🔔 PART 6: NOTIFICATION SYSTEM - ENHANCED
// ==========================================================================================
function setupNotificationSystem() {
    const btn = document.getElementById('notifBtn');
    const dropdown = document.getElementById('notifDropdown');

    if(btn && dropdown) {
        // Toggle dropdown on click
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent immediate close
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
            
            // Reset badge count when opened
            const badge = document.getElementById('alertCount');
            if (badge) {
                badge.style.display = 'none';
                badge.classList.remove('pulse-animation');
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        // Close when scrolling
        window.addEventListener('scroll', () => {
            dropdown.style.display = 'none';
        });
    }
}

// Function to populate notification list - Improved
function updateNotificationList(alerts, recentTx) {
    const list = document.getElementById('alertList');
    const badge = document.getElementById('alertCount');
    const countText = document.getElementById('notifCount');
    
    if(!list) return;

    list.innerHTML = ""; // Clear current list
    let alertCount = 0;

    // 1. PRIORITY: EMERGENCY ALERTS (Red Background)
    alerts.forEach(alert => {
        alertCount++;
        const li = document.createElement('li');
        li.className = "notification-item alert-notification";
        li.style.cursor = 'pointer';
        
        // Click event to locate bus
        li.onclick = () => {
            window.locateBus(alert.bus);
            document.getElementById('notifDropdown').style.display = 'none';
        };
        
        const timeStr = new Date(alert.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        li.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="me-3 text-danger">
                    <i class="fas fa-exclamation-circle fa-beat fs-5"></i>
                </div>
                <div class="flex-grow-1">
                    <strong class="text-danger d-block mb-1">SOS ALERT: BUS ${alert.bus}</strong>
                    <span class="text-dark small d-block mb-2">${alert.reason}</span>
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted"><i class="far fa-clock me-1"></i>${timeStr}</small>
                        <span class="badge bg-danger">Click to locate</span>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(li);
    });

    // 2. SECONDARY: RECENT TRANSACTIONS (Normal List)
    recentTx.slice(0, 5).forEach(tx => {
        const li = document.createElement('li');
        li.className = "notification-item transaction-notification";
        const time = new Date(tx.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        li.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="me-3 text-success">
                    <i class="fas fa-receipt fs-5"></i>
                </div>
                <div class="flex-grow-1">
                    <strong class="text-dark d-block mb-1">New Ticket Issued</strong>
                    <span class="text-muted small d-block">Bus ${tx.bus} • ${tx.route || 'Unknown Route'}</span>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <span class="badge bg-light text-dark border">₱${parseFloat(tx.amount || 0).toFixed(2)}</span>
                        <small class="text-muted" style="font-size: 0.75rem;">${time}</small>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(li);
    });

    // Update Badge UI
    if (badge) {
        if (alertCount > 0) {
            badge.style.display = 'flex';
            badge.innerText = alertCount > 9 ? '9+' : alertCount;
            badge.classList.add('pulse-animation');
            
            // Play sound if there are new alerts
            if(!isAlarmPlaying) playEmergencySound();
        } else {
            badge.style.display = 'none';
            stopEmergencySound();
        }
    }
    
    if(countText) countText.innerText = alertCount > 0 ? `${alertCount} new` : "0 new";
    
    if (list.innerHTML === "") {
        list.innerHTML = `
            <li class="text-center text-muted p-4">
                <i class="far fa-bell-slash fa-2x mb-3 d-block"></i>
                <span>No new notifications</span>
            </li>`;
    }
}

// Function to play SOS Sound - Enhanced
function playEmergencySound() {
    if (!window.AudioContext) return;
    
    try {
        if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        
        // Create beep pattern
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        isAlarmPlaying = true;
        
        // Stop after 0.3 seconds
        setTimeout(() => {
            if(oscillator) {
                oscillator.stop();
                isAlarmPlaying = false;
            }
        }, 300);
    } catch(e) {
        console.log("Audio not supported");
    }
}

function stopEmergencySound() {
    if(oscillator) {
        try { oscillator.stop(); } catch(e){}
        isAlarmPlaying = false;
    }
}

// ==========================================================================================
// 🗺️ PART 7: MAPS INITIALIZATION - ENHANCED
// ==========================================================================================
function initMaps() {
    // A. Live Fleet Map
    if(document.getElementById('map')) {
        mapInstance = L.map('map', {
            zoomControl: false,
            preferCanvas: true // Better performance
        }).setView([14.8078, 121.0111], 13);
        
        L.control.zoom({ 
            position: 'bottomright' 
        }).addTo(mapInstance);
        
        // Add OpenStreetMap layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(mapInstance);
        
        // Google Traffic Layer
        trafficLayer = L.tileLayer('https://mt0.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}', {
            attribution: 'Traffic Data © Google',
            maxZoom: 20
        });

        window.mapInstance = mapInstance;
        
        // User Location (HQ) with better error handling
        mapInstance.locate({setView: false, maxZoom: 15, enableHighAccuracy: true});
        
        mapInstance.on('locationfound', function(e) {
            L.circleMarker(e.latlng, {
                radius: 8,
                fillColor: "#4361ee", 
                color: "#fff", 
                weight: 3, 
                opacity: 1, 
                fillOpacity: 1
            }).addTo(mapInstance).bindPopup("<b>COMMAND CENTER (HQ)</b>").openPopup();
            
            // Add pulse effect circle
            L.circle(e.latlng, {
                radius: 100, 
                color: '#4361ee', 
                opacity: 0.1,
                fillOpacity: 0.1
            }).addTo(mapInstance);
        });
        
        mapInstance.on('locationerror', function(e) {
            console.log("Location error:", e.message);
            showToast("Unable to get your location. Using default view.", "warning");
        });
    }

    // B. Route Config Map
    if(document.getElementById('configMap')) {
        configMapInstance = L.map('configMap', {
            preferCanvas: true
        }).setView([14.8078, 121.0111], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(configMapInstance);

        window.configMapInstance = configMapInstance;
        
        // Add click listener for route points
        configMapInstance.on('click', function(e) {
            addRoutePoint(e.latlng);
        });
        
        // Add scale control
        L.control.scale({imperial: false}).addTo(configMapInstance);
    }
}

// Add Draggable Points Logic - Enhanced
function addRoutePoint(latlng) {
    const { lat, lng } = latlng;
    routePoints.push({ lat, lng });
    
    let title = routePoints.length === 1 ? "Origin (Start)" : "Stop " + (routePoints.length - 1);
    let color = routePoints.length === 1 ? 'green' : 'gold';
    
    // Create draggable marker
    const marker = L.marker([lat, lng], { 
        draggable: true, 
        title: title,
        icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${color};" class="marker-pin"></div>`,
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(configMapInstance).bindPopup(`<b>${title}</b><br>Drag to adjust`).openPopup();

    // Redraw line when dragged
    marker.on('dragend', function(e) {
        const newPos = e.target.getLatLng();
        const index = routeMarkers.indexOf(marker);
        if (index !== -1) {
            routePoints[index] = { lat: newPos.lat, lng: newPos.lng };
            
            // Update hidden form inputs if Origin/Destination
            if(index === 0) {
                document.getElementById('originLat').value = newPos.lat;
                document.getElementById('originLng').value = newPos.lng;
            } else if (index === routePoints.length - 1) {
                document.getElementById('destLat').value = newPos.lat;
                document.getElementById('destLng').value = newPos.lng;
            }
            
            if (routePoints.length > 1) fetchMultiStopRoute(routePoints);
        }
    });

    routeMarkers.push(marker);
    if (routePoints.length > 1) fetchMultiStopRoute(routePoints);
    
    // Update inputs for first point
    if (routePoints.length === 1) {
        document.getElementById('originLat').value = lat;
        document.getElementById('originLng').value = lng;
        showToast("✅ Origin set. Click map to add stops.", "success");
    }
}

// OSRM API Call (Draw Blue Line) - Enhanced
function fetchMultiStopRoute(points) {
    if (points.length < 2) return;
    
    const coordsString = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

    fetch(url)
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        if(data.routes && data.routes.length > 0) {
            const routeGeoJSON = data.routes[0].geometry;
            if(currentRouteLayer) configMapInstance.removeLayer(currentRouteLayer);
            
            // Styled Blue Line
            currentRouteLayer = L.geoJSON(routeGeoJSON, {
                style: { 
                    color: '#4361ee', 
                    weight: 6, 
                    opacity: 0.8, 
                    lineCap: 'round',
                    dashArray: null
                }
            }).addTo(configMapInstance);
            
            // Save waypoints to hidden input
            document.getElementById('waypointsData').value = JSON.stringify(points);
            
            // Fit bounds to route
            const bounds = L.geoJSON(routeGeoJSON).getBounds();
            configMapInstance.fitBounds(bounds, { padding: [50, 50] });
        }
    })
    .catch(err => {
        console.error("Routing Error:", err);
        // Fallback: Straight line
        if(currentRouteLayer) configMapInstance.removeLayer(currentRouteLayer);
        const latlngs = points.map(p => [p.lat, p.lng]);
        currentRouteLayer = L.polyline(latlngs, {
            color: 'red', 
            dashArray: '5, 10',
            weight: 3,
            opacity: 0.7
        }).addTo(configMapInstance);
        
        showToast("Using straight line (offline mode)", "warning");
    });
}

// Map Controls - Enhanced
window.finishPlotting = () => {
    if(routePoints.length < 2) {
        showToast("Need more points. At least 2 points required.", "warning");
        return;
    }
    
    const lastIdx = routePoints.length - 1;
    const lastPoint = routePoints[lastIdx];
    
    // Update last marker
    if (routeMarkers[lastIdx]) {
        routeMarkers[lastIdx].bindPopup("<b>Destination (End)</b>").openPopup();
    }

    document.getElementById('destLat').value = lastPoint.lat;
    document.getElementById('destLng').value = lastPoint.lng;
    
    showToast("✅ Route plotting complete! You can now save the route.", "success");
};

window.clearRoutePlot = () => {
    if (routePoints.length > 0) {
        if (!confirm("Are you sure you want to clear all points?")) {
            return;
        }
    }
    
    routePoints = [];
    routeMarkers.forEach(m => configMapInstance.removeLayer(m));
    routeMarkers = [];
    if(currentRouteLayer) configMapInstance.removeLayer(currentRouteLayer);
    document.getElementById('waypointsData').value = "";
    document.getElementById('originLat').value = "";
    document.getElementById('originLng').value = "";
    document.getElementById('destLat').value = "";
    document.getElementById('destLng').value = "";
    
    showToast("Map cleared.", "info");
};

window.searchLocation = () => {
    const query = document.getElementById('searchLocInput').value.trim();
    if(!query) {
        showToast("Please type a location first.", "warning");
        return;
    }
    
    // Show loading
    const searchBtn = document.querySelector('.map-search-container button');
    const originalHTML = searchBtn.innerHTML;
    searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=5`)
        .then(res => res.json())
        .then(data => {
            searchBtn.innerHTML = originalHTML;
            
            if(data && data.length > 0) {
                configMapInstance.flyTo([data[0].lat, data[0].lon], 15);
                
                // Add marker for found location
                L.marker([data[0].lat, data[0].lon], {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
                        iconSize: [35, 35]
                    })
                })
                .addTo(configMapInstance)
                .bindPopup(`<b>${data[0].display_name}</b>`)
                .openPopup();
                
                showToast(`📍 Location found: ${data[0].display_name.split(',')[0]}`, "success");
            } else {
                showToast("Location not found.", "error");
            }
        })
        .catch(err => {
            searchBtn.innerHTML = originalHTML;
            showToast("Search service unavailable. Check internet connection.", "error");
        });
};

window.toggleTraffic = () => {
    if(mapInstance.hasLayer(trafficLayer)) {
        mapInstance.removeLayer(trafficLayer);
        showToast("Traffic Layer: OFF", "info");
    } else {
        mapInstance.addLayer(trafficLayer);
        showToast("🚦 Traffic Layer: ON", "success");
    }
};

// Track current map view type (for dark mode filter)
let currentMapViewType = 'street'; // 'street' or 'satellite'

window.toggleSatellite = (type) => {
    const target = type === 'live' ? mapInstance : configMapInstance;
    currentMapViewType = 'satellite';
    
    // Remove existing tile layers
    target.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            target.removeLayer(layer);
        }
    });
    
    // Add satellite layer (no dark mode filter will apply)
    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 19,
        className: 'satellite-layer'
    }).addTo(target);
    
    // Remove dark mode filter effect from satellite layer
    const tilePane = target.getPane('tilePane');
    if (tilePane) {
        tilePane.classList.add('satellite-view');
    }
    
    showToast("🛰️ Satellite view activated", "success");
};

window.toggleStreet = (type) => {
    const target = type === 'live' ? mapInstance : configMapInstance;
    currentMapViewType = 'street';
    
    // Remove existing tile layers
    target.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            target.removeLayer(layer);
        }
    });
    
    // Add street layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(target);
    
    // Restore dark mode filter for street view
    const tilePane = target.getPane('tilePane');
    if (tilePane) {
        tilePane.classList.remove('satellite-view');
    }
    
    showToast("🗺️ Street view activated", "success");
};

// Toggle Legend Visibility
window.toggleLegend = () => {
    const legend = document.getElementById('mapLegend');
    if (legend) {
        legend.classList.toggle('hidden');
    }
};

window.locateBus = (busNum) => {
    let found = false;
    
    // Switch to map section
    const mapTab = document.querySelector('a[href="#map-section"]');
    if (mapTab) {
        mapTab.click();
    }
    
    Object.values(busMarkers).forEach((marker) => {
       const content = marker.getPopup().getContent();
       if(content.includes(`BUS ${busNum}`)) {
           setTimeout(() => {
               mapInstance.flyTo(marker.getLatLng(), 17);
               marker.openPopup();
               marker.getElement().classList.add('highlighted-marker');
               
               // Remove highlight after 3 seconds
               setTimeout(() => {
                   marker.getElement().classList.remove('highlighted-marker');
               }, 3000);
           }, 500);
           found = true;
       }
    });
    
    document.getElementById('notifDropdown').style.display = 'none';
    
    if(!found) {
        showToast(`Bus ${busNum} is offline or not found.`, "error");
    }
};

// ==========================================================================================
// 💸 PART 8: EXPENSE MANAGEMENT - ENHANCED
// ==========================================================================================
window.openExpenseModal = () => {
    document.getElementById('expenseModal').style.display = 'flex';
    
    // Auto-focus on amount field
    setTimeout(() => {
        document.getElementById('expAmount').focus();
    }, 100);
};

window.submitExpense = () => {
    const type = document.getElementById('expType').value;
    const amount = parseFloat(document.getElementById('expAmount').value);
    const bus = document.getElementById('expBus').value.trim() || "General";
    const notes = document.getElementById('expNotes').value.trim();

    if(!amount || amount <= 0) {
        showToast("Invalid amount. Must be a positive number.", "error");
        return;
    }

    if(amount > 1000000) {
        showToast("Amount too large. Please verify.", "error");
        return;
    }

    // Show loading
    const submitBtn = document.querySelector('#expenseModal .btn-primary');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;

    // SAVE DIRECTLY TO FIREBASE
    push(ref(db, 'Expenses'), {
        type, 
        amount, 
        bus, 
        notes,
        timestamp: Date.now(),
        date: new Date().toLocaleDateString('en-PH'),
        addedBy: localStorage.getItem("dashboardSession") || "Admin"
    }).then(() => {
        showToast("✅ Expense Saved Successfully!", "success");
        document.getElementById('expenseModal').style.display = 'none';
        
        // Reset form
        document.getElementById('expAmount').value = "";
        document.getElementById('expBus').value = "";
        document.getElementById('expNotes').value = "";
    }).catch(err => {
        showToast("Error saving: " + err.message, "error");
    }).finally(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
};

// ==========================================================================================
// 📊 PART 9: CHARTS INITIALIZATION - ENHANCED
// ==========================================================================================
function initCharts() {
    // Config for Chart Colors (based on CSS variables)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#f8fafc' : '#2d3436';

    // 1. REVENUE CHART (Line) - Enhanced
    const ctxMain = document.getElementById('mainChart');
    if (ctxMain) {
        mainChart = new Chart(ctxMain.getContext('2d'), {
            type: 'line',
            data: {
                labels: ['6AM', '8AM', '10AM', '12PM', '2PM', '4PM', 'Now'],
                datasets: [{
                    label: 'Revenue Trend',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#4361ee',
                    backgroundColor: (ctx) => {
                        const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 300);
                        gradient.addColorStop(0, 'rgba(67, 97, 238, 0.3)');
                        gradient.addColorStop(1, 'rgba(67, 97, 238, 0.0)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#4361ee',
                    pointBorderWidth: 2,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        titleFont: { family: 'Poppins' },
                        bodyFont: { family: 'Poppins' },
                        padding: 12
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false, color: gridColor }, 
                        ticks: { color: textColor, font: { family: 'Poppins' } }
                    },
                    y: { 
                        grid: { color: gridColor, borderDash: [5, 5] }, 
                        ticks: { 
                            color: textColor, 
                            font: { family: 'Poppins' },
                            callback: (val) => '₱' + val.toLocaleString()
                        }
                    }
                }
            }
        });
    }
    
    // 2. TOP ROUTES CHART (Bar) - Enhanced
    const ctxRoute = document.getElementById('routeChart');
    if (ctxRoute) {
        routeChart = new Chart(ctxRoute.getContext('2d'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Total Passengers',
                    data: [],
                    backgroundColor: '#00cec9',
                    borderRadius: 8,
                    borderWidth: 0,
                    barThickness: 25
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        titleFont: { family: 'Poppins' },
                        bodyFont: { family: 'Poppins' }
                    }
                },
                scales: {
                    x: { 
                        grid: { color: gridColor }, 
                        ticks: { color: textColor, font: { family: 'Poppins' } }
                    },
                    y: { 
                        grid: { display: false }, 
                        ticks: { color: textColor, font: { family: 'Poppins' } }
                    }
                }
            }
        });
    }

    // 3. PAYMENT METHODS CHART (Doughnut) - Enhanced
    const ctxPay = document.getElementById('paymentMethodChart');
    if (ctxPay) {
        paymentChart = new Chart(ctxPay.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Cash', 'GCash'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#fdcb6e', '#2ecc71'],
                    borderWidth: 0,
                    borderRadius: 10,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { 
                            color: textColor, 
                            usePointStyle: true,
                            font: { family: 'Poppins', size: 12 },
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        bodyFont: { family: 'Poppins' },
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ₱${value.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// Function to update chart colors on theme switch
function updateChartTheme(isDark) {
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#f8fafc' : '#2d3436';

    [mainChart, routeChart, paymentChart].forEach(chart => {
        if (chart) {
            chart.options.plugins.legend.labels.color = textColor;
            
            if (chart.options.scales) {
                Object.keys(chart.options.scales).forEach(scale => {
                    if (chart.options.scales[scale].ticks) {
                        chart.options.scales[scale].ticks.color = textColor;
                    }
                    if (chart.options.scales[scale].grid) {
                        chart.options.scales[scale].grid.color = gridColor;
                    }
                });
            }
            
            chart.update();
        }
    });
}

// ==========================================================================================
// 📡 PART 10: FIREBASE REAL-TIME LISTENER - CORE FUNCTIONALITY
// ==========================================================================================
// Simulan ang real-time listener para makakuha ng live data mula sa Firebase
// Ito ay magiging active hanggang sa pagsara ng page
function startFirebaseListener() {
    console.log("🔥 Starting Firebase real-time listener...");
    
    // Makinig sa buong database para sa real-time updates mula sa lahat ng devices
    onValue(ref(db, '/'), (snapshot) => {
        console.log("📡 Firebase data received");
        const data = snapshot.val() || {};
        
        // I-process at i-display ang natanggap na data
        processFirebaseData(data);
    }, (error) => {
        console.error("❌ Firebase listener error:", error);
        showToast("Firebase connection error: " + error.message, "error");
    });
}

// Proseso ang lahat ng data mula sa Firebase at i-update ang dashboard
// Ito ang main function na nag-proseso ng transactions, routes, at bus status
function processFirebaseData(data) {
    const devices = data.POS_Devices || {};
    const expenses = data.Expenses || {};
    
    // I-reset ang lahat ng counters bago mag-proseso ng bagong data
    let totalRev = 0, totalExp = 0, activeCount = 0, totalPax = 0;
    let cashTotal = 0, gcashTotal = 0;
    
    let allTransactions = [];
    let routeStats = {}; 
    let isThereEmergency = false; 
    let alerts = [];

    // Gumawa ng map para i-track ang unique buses (Key: BusNumber, Value: Latest Data)
    // Ito ay para maiwasan ang duplicate entries kapag may maraming device IDs
    let uniqueBuses = new Map(); 

    // 1. I-process ang lahat ng expenses
    Object.values(expenses).forEach(exp => {
        totalExp += parseFloat(exp.amount || 0);
    });

    // 2. I-process ang lahat ng devices (Buses) at kunin ang latest status
    if (devices && Object.keys(devices).length > 0) {
        console.log(`📊 Processing ${Object.keys(devices).length} devices`);
        
        Object.keys(devices).forEach(deviceId => {
            const bus = devices[deviceId];
            
            // --- A. I-check ang Live Status ng bus (online/offline) ---
            if (bus.LiveStatus) {
                const live = bus.LiveStatus;
                const busKey = live.busNumber || deviceId;
                
                // Kung walang update sa loob ng 5 minutes, considered offline na
                const isOnline = (Date.now() - (live.lastUpdate || 0)) < 300000;
                // Sumama ang cash at GCash para sa total revenue ng bus
                const revenue = (parseFloat(live.totalCash)||0) + (parseFloat(live.totalGcash)||0);
                // Sumama ang lahat ng passenger types (regular, student, senior)
                const pax = (parseInt(live.regularCount)||0) + (parseInt(live.studentCount)||0) + (parseInt(live.seniorCount)||0);

                // I-check kung may emergency/SOS alert ang bus

                if (live.emergencyStatus === true) {
                    isThereEmergency = true;
                    
                    alerts.push({ 
                        bus: live.busNumber, 
                        reason: live.emergencyReason || 'Driver pressed SOS', 
                        time: live.lastUpdate 
                    });
                }

                // Kunin ang actual route from the most recent transaction, or use currentLoop as fallback
                // Kung wala pa ring route, i-mark as Unassigned na lang
                let assignedRoute = "Unassigned";
                if (bus.Trips) {
                    const trips = Object.values(bus.Trips);
                    if (trips.length > 0) {
                        // Hanapin ang latest trip na may route information
                        for (let i = trips.length - 1; i >= 0; i--) {
                            if (trips[i].Transactions) {
                                const txArray = Object.values(trips[i].Transactions);
                                if (txArray.length > 0) {
                                    const latestTx = txArray[txArray.length - 1];
                                    if (latestTx.origin && latestTx.destination) {
                                        assignedRoute = `${latestTx.origin} → ${latestTx.destination}`;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                // Kung wala pa ring route, gamitin ang currentLoop if available
                if (assignedRoute === "Unassigned" && live.currentLoop) {
                    assignedRoute = live.currentLoop;
                }

                // I-gather ang bus data para sa display at processing
                const busData = {
                    id: deviceId,
                    bus: live.busNumber || 'Unknown',
                    driver: live.driver || 'N/A',
                    conductor: live.conductor || 'N/A',
                    route: assignedRoute,
                    status: isOnline ? 'Online' : 'Offline',
                    cash: parseFloat(live.totalCash)||0,
                    gcash: parseFloat(live.totalGcash)||0,
                    total: revenue,
                    pax: pax,
                    speed: live.speed || 0,
                    emergency: live.emergencyStatus,
                    lastUpdate: live.lastUpdate || 0,
                    lat: live.lat, 
                    lng: live.lng
                };

                // Para sa duplicate buses, kunin lang ang latest update based sa timestamp
                // Ito ay importante kung may multiple devices na nag-report ng same bus
                if (uniqueBuses.has(busKey)) {
                    if (busData.lastUpdate > uniqueBuses.get(busKey).lastUpdate) {
                        uniqueBuses.set(busKey, busData);
                    }
                } else {
                    uniqueBuses.set(busKey, busData);
                }
            }

            // --- B. I-process ang Transactions para sa route analytics ---
            // Ito ang detailed ticket history ng bus na gagamitin para sa top routes chart
            if (bus.Trips) {
                Object.values(bus.Trips).forEach(trip => {
                    if (trip.Transactions) {
                        Object.values(trip.Transactions).forEach(tx => {
                            // I-collect ang bawat transaction para sa transaction log
                            allTransactions.push({
                                time: tx.timestamp,
                                bus: tx.busNo,
                                driver: tx.driver,
                                conductor: tx.conductor,
                                route: `${tx.origin} → ${tx.destination}`,
                                type: tx.passengerType,
                                amount: tx.totalAmount
                            });

                            // I-calculate ang passenger count per route para sa analytics
                            // Ito ang gagamitin sa "Top Routes" chart sa dashboard
                            if (tx.origin && tx.destination) {
                                const routeName = `${tx.origin} → ${tx.destination}`;
                                if (!routeStats[routeName]) routeStats[routeName] = 0;
                                routeStats[routeName] += parseInt(tx.passengerCount || 1);
                            }
                        });
                    }
                });
            }
        });
    } else {
        console.log("⚠️ No devices found in Firebase");
    }

    // I-convert ang Map to Array para sa display at processing
    // Ito ay i-store globally para accessible ang bus list sa modal
    let busRevenueList = Array.from(uniqueBuses.values());
    window.currentBusList = busRevenueList;

    // 3. I-sum up ang lahat ng totals mula sa active buses
    // Ito ang gagamitin para sa dashboard statistics cards
    busRevenueList.forEach(bus => {
        if (bus.status === 'Online') activeCount++;
        totalRev += bus.total;
        cashTotal += bus.cash;
        gcashTotal += bus.gcash;
        totalPax += bus.pax;

        // I-update ang bus markers sa map para sa real-time location tracking
        if (bus.lat && bus.lng) updateBusMarker(bus.bus, bus);
    });

    // 4. I-refresh ang dashboard UI gamit ang animated counters
    updateDashboardStats(totalRev, totalExp, activeCount, totalPax, cashTotal, gcashTotal);

    // Ipakita ang alert banner kung may emergency/SOS
    const alertCard = document.getElementById('mainAlertCard');
    if(alertCard) {
        alertCard.style.display = isThereEmergency ? 'flex' : 'none';
        if(isThereEmergency) {
            alertCard.classList.add('flash-animation');
            document.getElementById('mainAlertMsg').innerText = `SOS DETECTED: ${alerts[0]?.bus || 'Unknown Bus'} - ${alerts[0]?.reason || 'Needs Assistance'}`;
            
            // Add dismiss functionality
            const dismissBtn = alertCard.querySelector('.alert-dismiss');
            if (dismissBtn) {
                dismissBtn.onclick = () => {
                    alertCard.style.display = 'none';
                    stopEmergencySound();
                    showToast("Emergency alert dismissed", "info");
                };
            }
        } else {
            alertCard.classList.remove('flash-animation');
        }
    }
    
    // Update Notification Bell List
    updateNotificationList(alerts, allTransactions.slice(-5).reverse());

    // Update Charts Real-time
    updateCharts(totalRev, cashTotal, gcashTotal, routeStats);

    // Render Tables
    renderRevenueTable(busRevenueList);
    renderTransactionTable(allTransactions);
    renderTopPerformers(busRevenueList);
}

function updateDashboardStats(totalRev, totalExp, activeCount, totalPax, cashTotal, gcashTotal) {
    // Animate number updates
    animateNumber('grossRevenue', totalRev, '₱');
    animateNumber('totalExpenses', totalExp, '₱');
    animateNumber('netProfit', totalRev - totalExp, '₱');
    animateNumber('totalRevenue', totalRev, '₱');
    animateNumber('activeBuses', activeCount, '');
    animateNumber('totalPax', totalPax, '');
    
    // Update daily expenses (just shows total expenses for now)
    document.getElementById('dailyExpenses').innerText = '₱' + totalExp.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function animateNumber(id, endValue, prefix = '') {
    const el = document.getElementById(id);
    if(!el) return;
    
    const currentValue = parseFloat(el.innerText.replace(/[^0-9.-]+/g,"")) || 0;
    const duration = 500;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = (endValue - currentValue) / steps;
    let currentStep = 0;
    
    const timer = setInterval(() => {
        currentStep++;
        const newValue = currentValue + (increment * currentStep);
        
        if (currentStep >= steps) {
            clearInterval(timer);
            el.innerText = prefix + endValue.toLocaleString(undefined, {minimumFractionDigits: 2});
        } else {
            el.innerText = prefix + Math.round(newValue).toLocaleString();
        }
    }, stepTime);
}

function updateCharts(rev, cash, gcash, routes) {
    if(mainChart) {
        const step = rev / 6;
        mainChart.data.datasets[0].data = [
            step * 0.5, step * 1, step * 1.5, 
            step * 2.5, step * 3.5, step * 4.5, rev
        ];
        mainChart.update('none');
    }
    if(paymentChart) {
        paymentChart.data.datasets[0].data = [cash, gcash];
        paymentChart.update('none');
    }
    
    // Top Routes Logic (Sorted)
    if(routeChart) {
        const sortedRoutes = Object.entries(routes).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (sortedRoutes.length > 0) {
            routeChart.data.labels = sortedRoutes.map(i => i[0]);
            routeChart.data.datasets[0].data = sortedRoutes.map(i => i[1]);
        } else {
            routeChart.data.labels = ["No Data"];
            routeChart.data.datasets[0].data = [0];
        }
        routeChart.update('none');
    }
}

// ==========================================================================================
// 📍 PART 11: UI RENDERERS - ENHANCED
// ==========================================================================================
// I-update o i-create ang marker sa map para sa bawat bus
// Ito ay nag-iupdate ng location, status icon, at popup information
function updateBusMarker(id, data) {
    // Kung walang map instance, i-exit lang
    if(!mapInstance) return;
    
    // Kunin ang status ng bus para sa icon selection
    const isSOS = data.emergency === true;
    const isOnline = data.status === 'Online';
    
    // Pumili ng icon base sa status: Red para sa SOS, Green para online, Gray para offline
    let iconUrl = isSOS ? 
        'https://cdn-icons-png.flaticon.com/512/10309/10309194.png' : 
        (isOnline ? 
            'https://cdn-icons-png.flaticon.com/512/3448/3448339.png' : 
            'https://cdn-icons-png.flaticon.com/512/3448/3448302.png'
        );
    
    // I-create ang custom icon gamit ang Leaflet
    const icon = L.icon({ 
        iconUrl: iconUrl, 
        iconSize: [40, 40], 
        iconAnchor: [20, 20], 
        popupAnchor: [0, -20] 
    });
    
    // I-build ang popup content na ipapakita sa map
    // May detailed info tungkol sa bus, driver, speed, passengers, sales
    const popupHTML = `
        <div class="bus-popup">
            <div class="popup-header">
                <strong>BUS ${data.bus}</strong>
                <small>${data.driver}</small>
            </div>
            <div class="popup-body">
                <div class="popup-row">
                    <span>Speed:</span>
                    <b>${data.speed || 0} km/h</b>
                </div>
                <div class="popup-row">
                    <span>Passengers:</span>
                    <b>${data.pax || 0}</b>
                </div>
                <div class="popup-row">
                    <span>Status:</span>
                    <span class="badge ${isOnline ? 'bg-success' : 'bg-secondary'}">
                        ${isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
                <div class="popup-row highlight">
                    <span>Sales:</span>
                    <b class="text-success">₱${(data.total || 0).toLocaleString()}</b>
                </div>
                ${isSOS ? `
                    <div class="popup-row emergency">
                        <span>🚨 Emergency:</span>
                        <b class="text-danger">SOS ACTIVE</b>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Kung existing na ang marker, i-update lang ang position at icon
    // Kung bagong bus, gumawa ng bagong marker
    if (busMarkers[id]) {
        busMarkers[id].setLatLng([data.lat, data.lng]).setIcon(icon).setPopupContent(popupHTML);
        // Kung may SOS, i-open agad ang popup para makita ng user
        if(isSOS && !busMarkers[id].isPopupOpen()) busMarkers[id].openPopup();
    } else {
        // Gumawa ng marker para sa bagong bus at i-add sa map
        busMarkers[id] = L.marker([data.lat, data.lng], {icon: icon})
            .addTo(mapInstance)
            .bindPopup(popupHTML);
            
        // Add click event to center map
        busMarkers[id].on('click', function() {
            mapInstance.flyTo([data.lat, data.lng], 16);
        });
    }
}

function renderTopPerformers(list) {
    const el = document.getElementById('topPerformersList');
    if(!el) return;
    
    // Sort by Sales High to Low
    const sorted = [...list].sort((a, b) => b.total - a.total).slice(0, 5);
    
    if(sorted.length === 0 || sorted[0].total === 0) {
        return el.innerHTML = `
            <li class="text-center p-4 text-muted">
                <i class="fas fa-bus me-2"></i>No sales data yet
            </li>`;
    }
    
    let html = "";
    sorted.forEach((bus, i) => {
        let medal = i===0 ? "🥇" : (i===1 ? "🥈" : (i===2 ? "🥉" : `<span class="badge bg-light text-dark">#${i+1}</span>`));
        let medalClass = i===0 ? "text-warning" : (i===1 ? "text-secondary" : (i===2 ? "text-danger" : "text-primary"));
        
        html += `<li class="d-flex justify-content-between align-items-center p-3 border-bottom hover-lift">
            <div class="d-flex align-items-center gap-3">
                <span class="fs-5 ${medalClass}">${medal}</span>
                <div>
                    <div class="fw-bold text-primary">BUS ${bus.bus}</div>
                    <small class="text-muted">${bus.driver}</small>
                </div>
            </div>
            <div class="text-end">
                <span class="text-success fw-bold">₱${bus.total.toLocaleString()}</span>
                <div class="small text-muted">${bus.pax} passengers</div>
            </div>
        </li>`;
    });
    el.innerHTML = html;
}

function renderRevenueTable(list) {
    const el = document.getElementById('revenueTableBody');
    if(!el) return;
    
    if(list.length === 0) {
        return el.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-4 text-muted">
                    <i class="fas fa-bus me-2"></i>Waiting for active buses...
                </td>
            </tr>`;
    }
    
    let html = "";
    // I-render ang bawat bus row sa table na may clickable na row para sa details
    list.forEach((bus, i) => {
        // Kung Unassigned o N/A ang route, ipakita ang gray badge, kung may route ipakita ang blue badge
        let route = bus.route === "N/A" || bus.route === "Unassigned" ? 
            `<span class="badge bg-secondary">Unassigned</span>` : 
            `<span class="badge bg-info text-dark">${bus.route}</span>`;
        
        // Kung may emergency/SOS, ipakita ang red emergency badge
        const emergencyBadge = bus.emergency ? 
            `<span class="badge bg-danger ms-1"><i class="fas fa-exclamation-triangle me-1"></i>SOS</span>` : '';
        
        // I-build ang HTML row para sa bawat bus
        html += `<tr onclick="window.showBusModal(${i})" style="cursor:pointer" class="hover-row">
            <td>
                ${bus.status === 'Online' ? 
                    '<span class="badge bg-success"><i class="fas fa-circle me-1"></i>Online</span>' : 
                    '<span class="badge bg-secondary"><i class="fas fa-circle me-1"></i>Offline</span>'
                }
                ${emergencyBadge}
            </td>
            <td class="fw-bold"><i class="fas fa-bus me-2 text-primary"></i>${bus.bus}</td>
            <td><i class="fas fa-user me-2 text-muted"></i>${bus.driver}</td>
            <td><i class="fas fa-user-tie me-2 text-muted"></i>${bus.conductor}</td>
            <td>${route}</td>
            <td class="text-end text-success">₱${bus.cash.toLocaleString()}</td>
            <td class="text-end text-success">₱${bus.gcash.toLocaleString()}</td>
            <td class="text-end fw-bold text-primary">₱${bus.total.toLocaleString()}</td>
        </tr>`;
    });
    el.innerHTML = html;
}

// I-render ang transaction logs table na may latest 50 transactions
// Ito ay para sa detailed record ng lahat ng sales per bus
function renderTransactionTable(list) {
    const el = document.getElementById('logsTableBody');
    if(!el) return;
    
    // Kunin lang ang latest 50 transactions at i-reverse para latest first
    const recent = list.slice(-50).reverse();
    if(recent.length === 0) {
        return el.innerHTML = `
            <tr>
                <td colspan="7" class="text-center p-4 text-muted">
                    <i class="fas fa-receipt me-2"></i>No transactions recorded today.
                </td>
            </tr>`;
    }
    
    let html = "";
    recent.forEach(tx => {
        const time = new Date(tx.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const typeBadge = tx.type === 'student' ? 
            '<span class="badge bg-info">Student</span>' : 
            tx.type === 'senior' ? 
            '<span class="badge bg-secondary">Senior</span>' : 
            '<span class="badge bg-primary">Regular</span>';
        
        html += `<tr class="hover-row">
            <td><i class="fas fa-clock me-2 text-muted"></i>${time}</td>
            <td><b>${tx.bus}</b></td>
            <td>${tx.driver}</td>
            <td>${tx.conductor || 'N/A'}</td>
            <td><small>${tx.route || 'Unknown'}</small></td>
            <td>${typeBadge}</td>
            <td class="fw-bold text-success">₱${parseFloat(tx.amount || 0).toFixed(2)}</td>
        </tr>`;
    });
    el.innerHTML = html;
}

// ========================================================
// 🚌 BUS MODAL - Ipakita ang detailed bus information
// ========================================================
// Ipakita ang modal popup kapag nag-click ang user sa bus row
// Dito makikita ang driver, conductor, route, at location info
window.showBusModal = (index) => {
    // I-verify kung may valid bus data para sa index na ito
    if (!window.currentBusList || !window.currentBusList[index]) {
        showToast("Bus data not available", "error");
        return;
    }
    
    const bus = window.currentBusList[index];
    
    // I-populate ang lahat ng modal fields gamit ang bus information
    document.getElementById('modalBusNo').innerHTML = `<i class="fas fa-bus me-2"></i>BUS ${bus.bus}`;
    document.getElementById('modalDriver').innerText = bus.driver;
    document.getElementById('modalConductor').innerText = bus.conductor;
    
    // Ipakita ang route - kung Unassigned ay may gray badge, kung may route ay text lang
    const routeEl = document.getElementById('modalRoute');
    if (bus.route === "Unassigned") {
        routeEl.innerHTML = `<span class="badge bg-secondary">Unassigned</span>`;
    } else {
        routeEl.innerText = bus.route;
    }
    
    // I-set ang bus number sa locate button para sa map navigation
    const locateBtn = document.getElementById('modalLocateBtn');
    if (locateBtn) {
        locateBtn.dataset.bus = bus.bus;
    }

    // Ipakita ang modal sa screen
    document.getElementById('busDetailsModal').style.display = 'flex';
    
    // Center map on this bus
    if (bus.lat && bus.lng && mapInstance) {
        mapInstance.flyTo([bus.lat, bus.lng], 16);
        const marker = busMarkers[bus.bus];
        if (marker) {
            marker.openPopup();
        }
    }
};

// Close modal function
window.closeBusModal = () => {
    document.getElementById('busDetailsModal').style.display = 'none';
};

// ==========================================================================================
// 🛣️ PART 12: ROUTE MANAGEMENT - ENHANCED
// ==========================================================================================
window.switchLoop = (path) => {
    currentRoutePath = path;
    document.getElementById('tabForward').classList.toggle('active', path === 'Routes_Forward');
    document.getElementById('tabReverse').classList.toggle('active', path === 'Routes_Reverse');
    loadRoutes();
};

function loadRoutes() {
    const list = document.getElementById('loopList');
    if(!list) return;
    
    list.innerHTML = `<li class="text-center p-3 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Loading...</li>`;

    onValue(ref(db, currentRoutePath), (snapshot) => {
        list.innerHTML = "";
        const data = snapshot.val();
        if (data) {
            Object.keys(data).sort().forEach(key => {
                const r = data[key];
                const li = document.createElement('li');
                li.className = 'route-item';
                
                li.innerHTML = `
                    <div class="route-info">
                        <div class="route-header">
                            <strong class="text-primary route-number">
                                ${key.replace(/route_(fwd|rev)_/, '#')}
                            </strong>
                            <span class="badge bg-primary">₱${parseFloat(r.price).toFixed(2)}</span>
                        </div>
                        <div class="route-path">
                            <span class="origin"><i class="fas fa-map-marker-alt text-success me-1"></i>${r.origin}</span>
                            <i class="fas fa-arrow-right mx-2 text-muted"></i>
                            <span class="destination"><i class="fas fa-flag-checkered text-danger me-1"></i>${r.destination}</span>
                        </div>
                        ${r.distance ? `<small class="text-muted"><i class="fas fa-road me-1"></i>${r.distance} km</small>` : ''}
                    </div>
                    <div class="route-actions">
                        <button class="btn btn-sm btn-outline-primary me-1" title="Edit" onclick="window.openRouteModal('${key}', '${r.origin}', '${r.destination}', '${r.price}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="window.deleteRoute('${key}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                list.appendChild(li);
            });
        } else {
            list.innerHTML = `
                <li class="text-center text-muted p-4">
                    <i class="fas fa-route fa-2x mb-3 d-block"></i>
                    No routes added yet.
                </li>`;
        }
    });
}

// Open Route Modal
window.openRouteModal = (key = '', from = '', to = '', price = '') => {
    document.getElementById('routeModal').style.display = 'flex';
    document.getElementById('editRouteKey').value = key;
    document.getElementById('routeFromModal').value = from;
    document.getElementById('routeToModal').value = to;
    document.getElementById('routePriceModal').value = price;
    
    document.getElementById('routeModalTitle').innerHTML = key ? 
        `<i class="fas fa-edit me-2"></i> Edit Route` : 
        `<i class="fas fa-plus-circle me-2"></i> Add New Route`;
    
    // Auto-focus on first field
    setTimeout(() => {
        document.getElementById('routeFromModal').focus();
    }, 100);
};

// Save Route Logic - Enhanced
window.saveRouteFromModal = () => {
    const key = document.getElementById('editRouteKey').value;
    const from = document.getElementById('routeFromModal').value.trim();
    const to = document.getElementById('routeToModal').value.trim();
    const price = document.getElementById('routePriceModal').value;
    
    if(!from || !to || !price) {
        showToast("Please fill all fields.", "warning");
        return;
    }
    
    if (isNaN(price) || parseFloat(price) <= 0) {
        showToast("Invalid fare amount. Must be a positive number.", "error");
        return;
    }
    
    const routeData = { 
        origin: from, 
        destination: to, 
        price: parseFloat(price),
        createdAt: new Date().toISOString(),
        createdBy: localStorage.getItem("dashboardSession") || "Admin"
    };

    // Show loading
    const saveBtn = document.querySelector('#routeModal .btn-primary');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    if(key) {
        // Edit Mode
        update(ref(db, `${currentRoutePath}/${key}`), routeData).then(() => {
            showToast("✅ Route Updated!", "success");
            document.getElementById('routeModal').style.display = 'none';
        }).catch(err => {
            showToast("Error updating route: " + err.message, "error");
        }).finally(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        });
    } else {
        // Add Mode
        get(ref(db, currentRoutePath)).then(snapshot => {
            let list = [];
            if (snapshot.exists()) {
                snapshot.forEach(c => list.push(c.val()));
            }
            list.push(routeData);
            
            // Sort by Price (Low to High)
            list.sort((a,b) => a.price - b.price);
            
            // Re-save with clean keys
            const newData = {};
            const prefix = currentRoutePath.includes('Forward') ? 'route_fwd_' : 'route_rev_';
            list.forEach((r, i) => {
                const k = `${prefix}${(i+1).toString().padStart(2,'0')}`;
                newData[k] = r;
            });
            
            return set(ref(db, currentRoutePath), newData);
        }).then(() => {
            showToast("✅ Route Added & Sorted!", "success");
            document.getElementById('routeModal').style.display = 'none';
        }).catch(err => {
            showToast("Error adding route: " + err.message, "error");
        }).finally(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        });
    }
};

// Delete Route with Confirmation
window.deleteRoute = (key) => {
    if(!confirm("Are you sure you want to delete this route?")) return;
    
    get(ref(db, currentRoutePath)).then(snapshot => {
        let list = [];
        snapshot.forEach(c => {
            if(c.key !== key) list.push(c.val());
        });
        
        const newData = {};
        const prefix = currentRoutePath.includes('Forward') ? 'route_fwd_' : 'route_rev_';
        
        if(list.length > 0) {
            list.forEach((r, i) => {
                const k = `${prefix}${(i+1).toString().padStart(2,'0')}`;
                newData[k] = r;
            });
            return set(ref(db, currentRoutePath), newData);
        } else {
            return remove(ref(db, currentRoutePath));
        }
    }).then(() => {
        showToast("✅ Route deleted successfully!", "success");
    }).catch(err => {
        showToast("Error deleting route: " + err.message, "error");
    });
};

// ==========================================================================================
// 🔧 PART 13: UTILITY FUNCTIONS - ENHANCED
// ==========================================================================================

// Custom Toast Notification System - Enhanced
function showToast(message, type = "info") {
    // Check if toast container exists
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
            width: 90%;
        `;
        document.body.appendChild(container);
    }

    // Define icons and colors for each type
    const typeConfig = {
        success: { icon: "fa-check-circle", color: "success" },
        error: { icon: "fa-times-circle", color: "danger" },
        warning: { icon: "fa-exclamation-triangle", color: "warning" },
        info: { icon: "fa-info-circle", color: "info" }
    };

    const config = typeConfig[type] || typeConfig.info;

    // Create Toast Element
    const toast = document.createElement('div');
    toast.className = `custom-toast custom-toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${config.icon} text-${config.color}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    // Auto Remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }
    }, 4000);
}

// Export CSV Function - Enhanced
window.exportCSV = () => {
    // Show loading
    const exportBtn = document.querySelector('button[onclick="window.exportCSV()"]');
    const originalText = exportBtn.innerHTML;
    exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
    exportBtn.disabled = true;
    
    // Create HTML styled table (Excel compatible)
    let html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 20px;
                color: #333;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 3px solid #4361ee;
                padding-bottom: 15px;
            }
            .header h1 {
                color: #4361ee;
                margin: 0;
                font-size: 28px;
                font-weight: 700;
            }
            .header p {
                color: #666;
                margin: 5px 0;
                font-size: 12px;
            }
            .info-box {
                background: #f3f4f6;
                border-left: 4px solid #4361ee;
                padding: 10px 15px;
                margin-bottom: 20px;
                border-radius: 4px;
            }
            .info-box p {
                margin: 5px 0;
                font-size: 12px;
                color: #555;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            thead {
                background: #4361ee;
                color: white;
            }
            th {
                padding: 12px 15px;
                text-align: left;
                font-weight: 700;
                border: 1px solid #3a56d4;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            td {
                padding: 10px 15px;
                border: 1px solid #e9ecef;
                font-size: 11px;
            }
            tbody tr:nth-child(odd) {
                background: #f8f9fa;
            }
            tbody tr:nth-child(even) {
                background: #ffffff;
            }
            tbody tr:hover {
                background: #eef2ff !important;
            }
            .summary {
                margin-top: 30px;
                border-top: 2px solid #4361ee;
                padding-top: 15px;
            }
            .summary-title {
                font-weight: 700;
                color: #4361ee;
                font-size: 14px;
                margin-bottom: 10px;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #e9ecef;
                font-size: 12px;
            }
            .summary-row:last-child {
                border-bottom: none;
            }
            .summary-label {
                font-weight: 600;
                color: #555;
            }
            .summary-value {
                color: #4361ee;
                font-weight: 700;
            }
            .footer {
                margin-top: 30px;
                padding-top: 15px;
                border-top: 1px solid #ddd;
                text-align: center;
                font-size: 10px;
                color: #999;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 POS Bus Ticketing System</h1>
            <p>Transaction Logs Report</p>
        </div>
        
        <div class="info-box">
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString('en-PH')}</p>
            <p><strong>Generated By:</strong> ${localStorage.getItem("dashboardSession") || "System Admin"}</p>
            <p><strong>System:</strong> Command Center Dashboard</p>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Bus #</th>
                    <th>Driver</th>
                    <th>Conductor</th>
                    <th>Route</th>
                    <th>Type</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add transaction rows
    const rows = document.querySelectorAll("#transactionTable tbody tr");
    rows.forEach((row) => {
        const cols = Array.from(row.querySelectorAll("td"));
        if(cols.length > 0) {
            html += '<tr>';
            cols.forEach((col, idx) => {
                html += `<td>${col.innerText.trim()}</td>`;
            });
            html += '</tr>';
        }
    });
    
    html += `
            </tbody>
        </table>
        
        <div class="summary">
            <div class="summary-title">📈 SUMMARY STATISTICS</div>
            <div class="summary-row">
                <span class="summary-label">Total Revenue</span>
                <span class="summary-value">${document.getElementById('totalRevenue')?.innerText || '₱0.00'}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Active Buses</span>
                <span class="summary-value">${document.getElementById('activeBuses')?.innerText || '0'}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Total Passengers</span>
                <span class="summary-value">${document.getElementById('totalPax')?.innerText || '0'}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Total Transactions</span>
                <span class="summary-value">${rows.length}</span>
            </div>
        </div>
        
        <div class="footer">
            <p>© ${new Date().getFullYear()} POS Bus Ticketing System. All rights reserved.</p>
            <p>This is an automated report generated by the system.</p>
        </div>
    </body>
    </html>
    `;
    
    // Create and download file
    const blob = new Blob([html], {type: "application/vnd.ms-excel;charset=utf-8;"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `POS_BUS_TICKETING_LOGS_${new Date().toISOString().slice(0,10)}.xls`;
    link.click();
    
    // Reset button
    setTimeout(() => {
        exportBtn.innerHTML = originalText;
        exportBtn.disabled = false;
    }, 1000);
    
    showToast("📊 Report exported successfully! Opening in Excel...", "success");
};

// Update Passcode Function - Enhanced
window.updatePasscode = () => {
    const code = document.getElementById('adminPasscode').value;
    if(code.length < 6) {
        showToast("Passcode must be at least 6 characters!", "error");
        return;
    }
    
    // Show loading
    const updateBtn = document.querySelector('button[onclick="updatePasscode()"]');
    const originalText = updateBtn.innerHTML;
    updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    updateBtn.disabled = true;
    
    update(ref(db, 'Config/GlobalSettings'), { adminPasscode: code })
        .then(() => {
            showToast("✅ Passcode Updated Successfully!", "success");
            document.getElementById('adminPasscode').value = "";
        })
        .catch(err => {
            showToast("Error updating passcode: " + err.message, "error");
        })
        .finally(() => {
            updateBtn.innerHTML = originalText;
            updateBtn.disabled = false;
        });
};

// Print Table Function - Enhanced
window.printTable = () => {
    showToast("Preparing print report...", "info");
    
    const tableContent = document.getElementById('transactionTable').outerHTML;
    const printWindow = window.open('', '_blank', 'height=700,width=1000');
    
    const adminName = localStorage.getItem("dashboardSession") || "System Admin";
    const currentTime = new Date().toLocaleString('en-PH');
    
    printWindow.document.write('<html><head><title>POS Bus Ticketing System - Transaction Report</title>');
    printWindow.document.write(`
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap');
            * { font-family: 'Poppins', sans-serif; box-sizing: border-box; }
            body { margin: 40px; padding: 0; color: #333; background: #f8fafc; }
            .print-header { text-align: center; margin-bottom: 40px; padding-bottom: 25px; border-bottom: 3px solid #4361ee; }
            .company-logo { display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 20px; }
            .company-logo h1 { margin: 0; color: #4361ee; font-size: 28px; font-weight: 700; }
            .company-logo .badge { background: #4361ee; color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px; }
            .report-title { font-size: 24px; color: #2d3436; margin: 10px 0; font-weight: 600; }
            .report-meta { display: flex; justify-content: space-between; margin-top: 25px; font-size: 13px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 13px; }
            th { background: #4361ee; color: white; padding: 15px; text-align: left; font-weight: 600; }
            td { padding: 12px 15px; border-bottom: 1px solid #eee; }
            tr:nth-child(even) { background-color: #f8f9fa; }
            .print-footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; }
            @media print { body { padding: 20px; background: white; } .no-print { display: none !important; } }
        </style>
    `);
    printWindow.document.write('</head><body>');
    printWindow.document.write(`
        <div class="print-header">
            <div class="company-logo">
                <h1>POS Bus Ticketing System</h1>
                <span class="badge">BUS TICKETING SYSTEM</span>
            </div>
            <div class="report-title">TRANSACTION LOG REPORT</div>
            <div class="report-meta">
                <div>Generated By: ${adminName}</div>
                <div>Date & Time: ${currentTime}</div>
            </div>
        </div>
    `);
    printWindow.document.write(tableContent);
    printWindow.document.write(`
        <div class="print-footer">
            <p>© ${new Date().getFullYear()} POS Bus Ticketing System. All rights reserved.</p>
        </div>
        <div class="no-print" style="text-align: center; margin-top: 30px;">
            <button onclick="window.print()" style="background: #4361ee; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; margin-right: 10px;">
                <i class="fas fa-print"></i> Print Report
            </button>
            <button onclick="window.close()" style="background: #6c757d; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer;">
                <i class="fas fa-times"></i> Close
            </button>
        </div>
    `);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.focus();
        showToast("Print dialog opened", "success");
    }, 1000);
};

// Bus Search Autocomplete - Enhanced
function setupBusSearchAutocomplete() {
    const searchInput = document.getElementById('findBusInput');
    const suggestionsDiv = document.getElementById('busSuggestions');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function() {
        const query = this.value.trim().toUpperCase();
        
        if (query.length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        // Get all available buses from current bus list
        const matchingBuses = window.currentBusList.filter(bus => {
            return bus.bus.toString().toUpperCase().includes(query);
        }).slice(0, 8); // Limit to 8 suggestions
        
        if (matchingBuses.length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        // Build suggestions HTML
        suggestionsDiv.innerHTML = matchingBuses.map(bus => `
            <div class="bus-suggestion-item" onclick="window.selectBusFromSuggestion('${bus.bus}')">
                <strong>BUS ${bus.bus}</strong>
                <small>${bus.driver || 'N/A'} • ₱${(bus.total || 0).toLocaleString()}</small>
            </div>
        `).join('');
        
        suggestionsDiv.style.display = 'block';
    });
    
    // Close suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.map-search-container')) {
            suggestionsDiv.style.display = 'none';
        }
    });
}

// Select bus from suggestion
window.selectBusFromSuggestion = (busNum) => {
    document.getElementById('findBusInput').value = `BUS ${busNum}`;
    document.getElementById('busSuggestions').style.display = 'none';
    window.findBusOnMap();
};

// Bus Search Function - Enhanced
window.findBusOnMap = () => {
    const input = document.getElementById('findBusInput').value.trim();
    const busNum = input.replace('BUS ', '').trim();
    
    if(!busNum) {
        showToast("Please enter a bus number", "error");
        return;
    }
    
    // Hide suggestions
    document.getElementById('busSuggestions').style.display = 'none';
    
    // Show loading
    const searchBtn = document.querySelector('button[onclick="window.findBusOnMap()"]');
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    searchBtn.disabled = true;
    
    let found = false;
    
    // Search through all bus markers
    Object.values(busMarkers).forEach((marker) => {
        const content = marker.getPopup().getContent();
        if(content.includes(`BUS ${busNum}`)) {
            mapInstance.flyTo(marker.getLatLng(), 17);
            marker.openPopup();
            found = true;
            
            // Highlight in table
            highlightBusInTable(busNum);
        }
    });
    
    // Reset button
    setTimeout(() => {
        searchBtn.innerHTML = originalText;
        searchBtn.disabled = false;
    }, 1000);
    
    if(found) {
        showToast(`Bus ${busNum} found and centered on map`, "success");
    } else {
        showToast("Bus not found or offline.", "error");
    }
};

// Highlight bus in table
function highlightBusInTable(busNum) {
    const rows = document.querySelectorAll('#revenueTableBody tr');
    rows.forEach(row => {
        row.classList.remove('highlighted-bus');
        if (row.textContent.includes(`BUS ${busNum}`)) {
            row.classList.add('highlighted-bus');
            
            // Scroll to row
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// Admin Management Functions
window.manageAccounts = () => {
    // Open admin accounts page in new tab
    window.open('admin_accounts.html', '_blank');
};

window.systemHealth = () => {
    // Check system health
    const healthStatus = {
        firebase: navigator.onLine ? "Connected" : "Disconnected",
        localStorage: "Available",
        time: new Date().toLocaleTimeString(),
        user: localStorage.getItem("dashboardSession") || "Not logged in"
    };
    
    alert(`System Health Check:\n\n• Firebase: ${healthStatus.firebase}\n• Local Storage: ${healthStatus.localStorage}\n• Time: ${healthStatus.time}\n• User: ${healthStatus.user}`);
};

window.showAdminToolsModal = () => {
    document.getElementById('adminToolsModal').style.display = 'flex';
};

// ==========================================================================================
// 🎯 PART 14: TAB SWITCHING & NAVIGATION
// ==========================================================================================
// Function to switch between tabs/sections
window.switchTab = (e, targetId) => {
    if (e) e.preventDefault();
    
    // Update active nav links
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    if (e && e.currentTarget) {
        e.currentTarget.classList.add('active');
    }
    
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Show target section
    const target = document.getElementById(targetId);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
        
        // Update page title
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.innerText = targetId.replace('-', ' ').toUpperCase();
        }
        
        // Refresh map size if needed - with proper timing for responsive layout
        if ((targetId === 'map-section') && window.mapInstance) {
            setTimeout(() => {
                window.mapInstance.invalidateSize(true);
                // Trigger resize event for any responsive listeners
                window.dispatchEvent(new Event('resize'));
            }, 100);
            setTimeout(() => {
                window.mapInstance.invalidateSize(true);
            }, 300);
        }
        
        if ((targetId === 'config-section' || targetId === 'config') && window.configMapInstance) {
            setTimeout(() => {
                window.configMapInstance.invalidateSize(true);
                window.dispatchEvent(new Event('resize'));
            }, 100);
            setTimeout(() => {
                window.configMapInstance.invalidateSize(true);
            }, 300);
        }
        
        // Close mobile sidebar after selection
        if (window.innerWidth < 992) {
            document.querySelector('.sidebar')?.classList.remove('mobile-open');
        }
    }
};

// Initialize the app
console.log("🚀 POS Bus Ticketing System Dashboard Loaded Successfully!");