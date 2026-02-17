// ========================
// 🔥 FIREBASE CONFIGURATION
// ========================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// 🎯 PRODUCTION FIREBASE CONFIG (gen-lang-client-0674280520)
const firebaseConfig = {
    apiKey: "AIzaSyDwbtq81niH-J_a8N_VS0gAEehuBUCrNWM",
    authDomain: "gen-lang-client-0674280520.firebaseapp.com",
    projectId: "gen-lang-client-0674280520",
    storageBucket: "gen-lang-client-0674280520.firebasestorage.app",
    messagingSenderId: "422725955268",
    appId: "1:422725955268:web:d8b1eba575e6ed87342391",
    measurementId: "G-CK7JEKCS46"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ========================
// 📋 LOAD PRICING CONFIGS
// ========================
async function loadConfigs() {
    try {
        // 🚨 CRITICAL: Document IDs MUST match backend seeder (seed-master-data.js)
        // NO "_v1" suffix - backend writes as: RIDE, SEND, FOOD_MART, CAR
        const configPromises = [
            getDoc(doc(db, 'pricing_configs', 'RIDE')),
            getDoc(doc(db, 'pricing_configs', 'SEND')),
            getDoc(doc(db, 'pricing_configs', 'FOOD_MART')),
            getDoc(doc(db, 'pricing_configs', 'CAR'))
        ];

        const [rideSnap, sendSnap, foodSnap, carSnap] = await Promise.all(configPromises);

        if (rideSnap.exists()) {
            window.APP.config.RIDE = rideSnap.data();
            console.log('✅ Loaded RIDE config');
        }

        if (sendSnap.exists()) {
            window.APP.config.SEND = sendSnap.data();
            console.log('✅ Loaded SEND config');
        }

        if (foodSnap.exists()) {
            window.APP.config.FOOD_MART = foodSnap.data();
            console.log('✅ Loaded FOOD_MART config');
        }

        if (carSnap.exists()) {
            window.APP.config.CAR = carSnap.data();
            console.log('✅ Loaded CAR config');
        }

        console.log('🎯 All pricing configs loaded from production Firestore');
    } catch (error) {
        console.error('❌ Failed to load pricing configs:', error);
        // Fallback: app will continue with null configs (will show errors in UI)
    }
}

// ========================
// 🚀 AUTO-LOAD ON PAGE READY
// ========================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadConfigs();
        initNoteAutoResize();
    });
} else {
    loadConfigs();
    initNoteAutoResize();
}

function initNoteAutoResize() {
    const noteInput = document.getElementById('note');
    if (!noteInput) return;

    noteInput.addEventListener('input', function () {
        this.style.height = 'auto'; // Reset height
        this.style.height = (this.scrollHeight) + 'px'; // Set to content height
        if (this.value === '') this.style.height = ''; // Reset on empty
    });
}

// Expose for debugging
window.FIREBASE_DB = db;


// 🎯 CENTRAL LOCATION STATE - Final Authority after commit
window.locationState = {
    pickup: { lat: null, lng: null, source: null, address: '' },
    dropoff: { lat: null, lng: null, source: null, address: '' }
};

// 🎯 CENTRAL APP STATE - MERGE with existing (auth, session)
window.APP = Object.assign(window.APP || {}, {
    service: 'RIDE',
    config: { RIDE: null, FOOD_MART: null, SEND: null, CAR: null },
    places: { origin: null, dest: null }, // Legacy compatibility
    calc: { distance: 0, price: 0 },
    map: null,
    pickerMap: null,
    directionsRenderer: null,
    markers: { origin: null, dest: null },
    historyData: null,
    carOptions: { seats: 4, toll: false },
    // 🔒 TRANSACTIONAL PICKER STATE MACHINE
    picker: {
        activeField: null,      // 'pickup' or 'dropoff'
        currentLocation: null,  // { lat, lng } - tracks drag silently
        locked: false,          // TRUE = no external writes allowed
        geocodeRequest: null
    }
});
Object.seal(window.APP.config); // Prevent adding new keys

const CONFIG_WA = "62895330091464";

function getServiceMapSettings(service) {
    const centerSalatiga = { lat: -7.3305, lng: 110.5084 };
    const isCar = service === 'CAR';
    return {
        center: centerSalatiga,
        zoom: isCar ? 10 : 13
    };
}

function initMap() {
    const mapSettings = getServiceMapSettings(window.APP.service);

    window.APP.map = new google.maps.Map(document.getElementById("map"), {
        center: mapSettings.center,
        zoom: mapSettings.zoom,
        restriction: {
            latLngBounds: {
                north: -6.5, south: -8.0, // Central Java Approx
                west: 109.5, east: 111.5
            },
            strictBounds: false // Soft bounce back
        },
        gestureHandling: "greedy",
        disableDefaultUI: true,
        clickableIcons: false,
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    // Initialize DirectionsRenderer for visual route
    window.APP.directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
            strokeColor: "#4285F4",
            strokeWeight: 5,
            strokeOpacity: 0.8
        }
    });
    window.APP.directionsRenderer.setMap(window.APP.map);

    checkHistory();
}

function checkHistory() {
    const stored = localStorage.getItem('bantujeg_history');
    if (stored) {
        try {
            const data = JSON.parse(stored);
            if (data && data.origin_addr && data.dest_addr) {
                window.APP.historyData = data;
                const chip = document.getElementById('history-chip');
                document.getElementById('history-text').innerText = `🕒 Pakai Rute Terakhir: ${cleanAddress(data.origin_addr)} → ${cleanAddress(data.dest_addr)}`;
                chip.style.display = 'flex';
            }
        } catch (e) { console.error(e); }
    }
}

window.useHistory = function () {
    const data = window.APP.historyData;
    if (!data) return;

    document.getElementById('history-chip').style.display = 'none';

    document.getElementById('origin').value = data.origin_addr;
    document.getElementById('destination').value = data.dest_addr;
    if (data.note) {
        const noteInput = document.getElementById('note');
        noteInput.value = data.note;
        // Trigger auto-resize manually
        noteInput.style.height = 'auto';
        noteInput.style.height = (noteInput.scrollHeight) + 'px';
    }

    window.APP.places.origin = {
        geometry: { location: new google.maps.LatLng(data.origin_lat, data.origin_lng) },
        formatted_address: data.origin_addr
    };
    window.APP.places.dest = {
        geometry: { location: new google.maps.LatLng(data.dest_lat, data.dest_lng) },
        formatted_address: data.dest_addr
    };

    updateMarker('origin', data.origin_lat, data.origin_lng);
    updateMarker('dest', data.dest_lat, data.dest_lng);
    expandMap();
    calculateRoute();
    toggleClearBtn('origin');
    toggleClearBtn('destination');
}

window.addNote = function (text) {
    const noteInput = document.getElementById('note');
    if (noteInput.value.length > 0) {
        noteInput.value += `, ${text}`;
    } else {
        noteInput.value = text;
    }
    // Trigger auto-resize
    noteInput.style.height = 'auto';
    noteInput.style.height = (noteInput.scrollHeight) + 'px';
    updateLink();
    toggleClearBtn('note');
}

function cleanAddress(address) {
    if (!address) return "";
    return address.replace(/^[A-Z0-9\+]{4,8}(\+[A-Z0-9]{2,})?,\s*/, '');
}

// 🎯 CENTRAL STATE ROUTING
window.setActiveField = function (field) {
    window.locationState.activeField = field;
}

function updateLocationState(field, lat, lng, source, address) {
    // Update central state
    window.locationState[field] = { lat, lng, source, address };

    // Sync to legacy APP.places for compatibility
    const placeType = field === 'pickup' ? 'origin' : 'dest';
    window.APP.places[placeType] = {
        geometry: { location: new google.maps.LatLng(lat, lng) },
        formatted_address: address
    };
}

window.handleInput = function (id) {
    toggleClearBtn(id);
    const val = document.getElementById(id).value;
    if (val.trim() === '') {
        if (id === 'origin' || id === 'destination') {
            const type = id === 'origin' ? 'origin' : 'dest';
            const field = id === 'origin' ? 'pickup' : 'dropoff';

            // Full state reset on empty (same as clearInput)
            window.APP.places[type] = null;
            window.locationState[field] = { lat: null, lng: null, source: null, address: '' };

            if (window.APP.markers[type]) {
                window.APP.markers[type].setMap(null);
                window.APP.markers[type] = null;
            }
            window.APP.calc.price = 0;
            document.getElementById('price-card').style.display = 'none';
            updateLink();
        }
    }
}

window.toggleClearBtn = function (id) {
    const input = document.getElementById(id);
    const btn = document.getElementById('clear-' + id);
    if (input.value.length > 0) btn.style.display = 'flex';
    else btn.style.display = 'none';
}

// 🧹 AUTHORITATIVE CLEAR - Full state reset, no ghost memory
window.clearInput = function (id) {
    const input = document.getElementById(id);
    input.value = '';
    toggleClearBtn(id);

    if (id === 'origin' || id === 'destination') {
        const type = id === 'origin' ? 'origin' : 'dest';
        const field = id === 'origin' ? 'pickup' : 'dropoff';

        // Rule 8: TRUE CLEAR = FULL STATE RESET
        // 1. Clear legacy state
        window.APP.places[type] = null;

        // 2. Clear central location state (CRITICAL)
        window.locationState[field] = { lat: null, lng: null, source: null, address: '' };

        // 3. Remove marker
        if (window.APP.markers[type]) {
            window.APP.markers[type].setMap(null);
            window.APP.markers[type] = null;
        }

        // 4. Reset price and hide cards
        window.APP.calc.price = 0;
        document.getElementById('price-card').style.display = 'none';
        document.getElementById('error-card').style.display = 'none';

        // 5. Clear any pending geocode
        window.APP.picker.geocodeRequest = null;

        updateLink();
    }
}

function updateMarker(type, lat, lng) {
    const map = window.APP.map;
    const markers = window.APP.markers;

    const iconUrl = type === 'origin'
        ? 'https://cdn-icons-png.flaticon.com/512/684/684908.png'
        : 'https://cdn-icons-png.flaticon.com/512/684/684913.png';

    if (markers[type]) markers[type].setMap(null);

    markers[type] = new google.maps.Marker({
        position: { lat: lat, lng: lng },
        map: map,
        icon: {
            url: iconUrl,
            scaledSize: new google.maps.Size(40, 40)
        },
        label: {
            text: type === 'origin' ? "Jemput" : "Tujuan",
            color: "black",
            fontWeight: "bold",
            fontSize: "12px",
            className: "map-tooltip"
        }
    });

    if (markers.origin && markers.dest) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(markers.origin.getPosition());
        bounds.extend(markers.dest.getPosition());
        map.fitBounds(bounds, { padding: 60 });
    } else {
        map.setCenter({ lat: lat, lng: lng });
        map.setZoom(16);
    }
}

window.getCurrentLocation = function (inputType) {
    // 🔒 PICKER LOCK GUARD - No GPS writes while picker is active
    if (window.APP.picker.locked) return;

    if (!navigator.geolocation) { alert("Browser tidak support GPS"); return; }

    const btnEl = document.getElementById('gps-' + inputType);
    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = "⏳ Tunggu...";

    // GPS OVERRIDE PREVENTION
    const field = inputType === 'origin' ? 'pickup' : 'dropoff';
    const existingState = window.locationState[field];

    // If user already set location manually, don't override
    if (existingState.source === 'manual' && existingState.lat && existingState.lng) {
        btnEl.innerHTML = originalText;
        alert("Lokasi sudah diatur manual. Hapus dulu untuk gunakan GPS.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const latlng = { lat: lat, lng: lng };

            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: latlng }, (results, status) => {
                btnEl.innerHTML = originalText;
                if (status === "OK" && results[0]) {
                    const rawAddr = results[0].formatted_address;
                    const cleaned = cleanAddress(rawAddr);

                    const type = inputType === 'origin' ? 'origin' : 'dest';

                    document.getElementById(inputType).value = cleaned;
                    toggleClearBtn(inputType);

                    // Write to central state with source='gps'
                    updateLocationState(field, lat, lng, 'gps', cleaned);
                    updateMarker(type, lat, lng);
                    expandMap();

                    if (window.APP.places.origin && window.APP.places.dest) calculateRoute();
                } else {
                    alert("Gagal mendeteksi nama jalan.");
                }
            });
        },
        (error) => {
            btnEl.innerHTML = originalText;
            alert("Gagal ambil lokasi. Pastikan GPS nyala!");
        }
    );
}

function initAutocomplete() {
    // 50KM RADIUS AROUND SALATIGA - BIAS NOT BLOCK
    const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(-7.78, 110.05), // Southwest
        new google.maps.LatLng(-6.88, 110.95)  // Northeast
    );

    const options = {
        bounds: bounds,
        componentRestrictions: { country: "id" },
        fields: ["geometry", "name", "formatted_address"],
        strictBounds: false, // BIAS results, don't block - prevents autocomplete lag
        types: ['establishment', 'geocode']
    };

    const acOrigin = new google.maps.places.Autocomplete(document.getElementById('origin'), options);
    const acDest = new google.maps.places.Autocomplete(document.getElementById('destination'), options);

    acOrigin.bindTo('bounds', window.APP.map);
    acDest.bindTo('bounds', window.APP.map);

    acOrigin.addListener('place_changed', () => handlePlaceSelect('origin', acOrigin));
    acDest.addListener('place_changed', () => handlePlaceSelect('dest', acDest));
}

function handlePlaceSelect(type, ac) {
    // 🔒 PICKER LOCK GUARD - No writes while picker is active
    if (window.APP.picker.locked) return;

    const place = ac.getPlace();
    if (!place.geometry) return;

    const inputId = type === 'origin' ? 'origin' : 'destination';
    const cleaned = cleanAddress(place.formatted_address);
    document.getElementById(inputId).value = cleaned;
    toggleClearBtn(inputId);

    // Write to central state with source tracking
    const field = type === 'origin' ? 'pickup' : 'dropoff';
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    updateLocationState(field, lat, lng, 'autocomplete', cleaned);
    updateMarker(type, lat, lng);
    calculateRoute();
}


async function calculateRoute() {
    const origin = window.APP.places.origin;
    const dest = window.APP.places.dest; // Changed from .destination to .dest to match APP.places structure

    if (!origin || !dest) {
        showError("Mohon isi lokasi jemput dan tujuan dulu ya Kak! 🙏");
        return;
    }

    // ==========================================
    // 🛡️ PAGAR GHAIB: CEK TITIK JEMPUT (PICKUP)
    // ==========================================
    const SALATIGA_CENTER = { lat: -7.3305, lng: 110.5084 }; // Alun-alun Pancasila

    // Hitung jarak dari Pusat Salatiga ke Titik Jemput User
    const distFromBase = google.maps.geometry.spherical.computeDistanceBetween(
        origin.geometry.location,
        new google.maps.LatLng(SALATIGA_CENTER.lat, SALATIGA_CENTER.lng)
    ) / 1000; // Convert ke KM

    // BATASAN: Driver cuma mau jemput max 15km dari pusat kota
    if (distFromBase > 15) {
        showError("Mohon maaf Kak, saat ini armada kami hanya melayani penjemputan di area Salatiga & Sekitarnya. 🙏");
        return; // ⛔ STOP PROSES
    }
    // ==========================================

    setLoading(true);
    document.getElementById('error-card').style.display = 'none'; // Clear previous errors

    // Get current service config
    const serviceKey = window.APP.service;
    const config = window.APP.config[serviceKey];

    // ✅ FIX: Set limit 150km for CAR, 30km for others
    let defaultLimit = 30;
    if (serviceKey === 'CAR') defaultLimit = 150;

    // Use backend config if exists, otherwise use strict default
    const maxDistance = config ? (config.max_distance_km || defaultLimit) : defaultLimit;

    const isCar = window.APP.service === 'CAR';
    const travelMode = isCar ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.TWO_WHEELER;
    const tollAllowed = window.APP.carOptions.toll;

    const directionsService = new google.maps.DirectionsService();
    const request = {
        origin: origin.geometry.location,
        destination: dest.geometry.location,
        travelMode: travelMode,
        avoidTolls: !tollAllowed
    };

    directionsService.route(request, function (result, status) {
        setLoading(false);

        if (status === google.maps.DirectionsStatus.OK) {
            window.APP.directionsRenderer.setDirections(result);
            if (result.routes[0]?.bounds) {
                window.APP.map.fitBounds(result.routes[0].bounds, { padding: 60 });
            }

            // Get distance & duration
            const leg = result.routes[0].legs[0];
            const distanceKm = leg.distance.value / 1000;
            const durationMins = Math.ceil(leg.duration.value / 60);

            // Apply motor estimate logic if not car
            let finalKm = distanceKm;
            if (!isCar) {
                const straightKm = google.maps.geometry.spherical.computeDistanceBetween(
                    leg.start_location,
                    leg.end_location
                ) / 1000;
                const configService = window.APP.config[window.APP.service] || window.APP.config.RIDE || {};
                const logic = configService.distance_logic || { lmf: 1.25, detour_limit: 1.15 };
                const motorEstimate = straightKm * logic.lmf;
                if (distanceKm > motorEstimate * logic.detour_limit) finalKm = motorEstimate;
                else if (distanceKm < straightKm * 1.05) finalKm = straightKm * 1.10;
            }

            window.APP.calc = {
                distance: parseFloat(finalKm.toFixed(2)),
                duration: durationMins
            };

            // Display Distance
            document.getElementById('dist-display').innerText = `${window.APP.calc.distance.toFixed(1)} km (${durationMins} mnt)`;

            // Check Max Distance
            if (window.APP.calc.distance > maxDistance) {
                // GANTI KATA-KATA DI SINI
                showError(`Maaf Kak, jarak pengantaran melebihi batas operasional kami (${maxDistance}km). 🙏`);
                window.APP.calc.price = 0;
            } else {
                calculatePrice(finalKm);
            }

            // Show Pricing UI
            document.getElementById('price-card').style.display = 'flex';
            document.getElementById('btn-submit').classList.remove('disabled');
            document.getElementById('btn-text').innerText = "Pesan Sekarang via WA";

            // Trigger update link
            updateLink();

        } else {
            showError("Waduh, rute tidak ditemukan. Coba geser titiknya dikit ya Kak! 🗺️");
            window.APP.calc.price = 0;
            document.getElementById('price-card').style.display = 'none';
            updateLink();
        }
    });
}

function showError(msg) {
    const errCard = document.getElementById('error-card');
    const priceCard = document.getElementById('price-card');
    const btn = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');

    errCard.style.display = 'block';
    errCard.innerText = "✋ " + msg;
    priceCard.style.display = 'none';
    btn.classList.add('disabled');
    btnText.innerText = "Jarak Terlalu Jauh";
    window.APP.calc.price = 0;
}

function calculatePrice(distance) {
    const service = window.APP.service;
    const config = window.APP.config[service];

    if (!config) {
        showError("Gagal mengambil data harga server. Refresh halaman.");
        return;
    }

    let price = 0;
    const tiers = config.pricing_model?.tiers || config.TIERS;

    if (Array.isArray(tiers)) {
        const tier = tiers.find(t => distance >= t.min_km && distance < t.max_km) || tiers[tiers.length - 1];
        if (tier.calculation_type === 'FLAT') price = tier.base_price;
        else price = tier.base_price + ((distance - tier.offset_km) * tier.price_per_km);
    }
    else if (tiers.BASE) {
        const baseLimit = tiers.BASE.max_distance_km || 2;
        if (distance <= baseLimit) price = tiers.BASE.delivery_fee;
        else price = tiers.MID.base_fee + ((distance - baseLimit) * tiers.MID.price_per_km);
    }

    if (service === 'CAR' && window.APP.carOptions.seats === 6) {
        price *= 1.3;
    }

    price = Math.ceil(price / 500) * 500;
    window.APP.calc.price = price;

    const fakePrice = Math.ceil((price * 1.10) / 500) * 500;
    document.getElementById('fake-price').innerText = `Rp ${fakePrice.toLocaleString('id-ID')}`;

    document.getElementById('price-display').innerText = `Rp ${price.toLocaleString('id-ID')}`;
    document.getElementById('dist-display').innerText = `${distance.toFixed(1)} km`;
    document.getElementById('price-card').style.display = 'flex';

    updateLink();
}

function updateLink() {
    const btn = document.getElementById('btn-submit');
    const textBtn = document.getElementById('btn-text');
    const price = window.APP.calc.price;

    const originVal = document.getElementById('origin').value.trim();
    const destVal = document.getElementById('destination').value.trim();

    if (price === 0 || originVal === '' || destVal === '') {
        btn.classList.add('disabled');
        textBtn.innerText = "Isi Lokasi Dulu";
        return;
    }

    const orgLat = window.APP.places.origin?.geometry?.location?.lat();
    const orgLng = window.APP.places.origin?.geometry?.location?.lng();
    const destLat = window.APP.places.dest?.geometry?.location?.lat();
    const destLng = window.APP.places.dest?.geometry?.location?.lng();

    let displayService = window.APP.service;
    let serviceCode = 'OJK';

    if (window.APP.service === 'RIDE') { displayService = 'Ojek'; serviceCode = 'OJK'; }
    if (window.APP.service === 'SEND') { displayService = 'Kirim Barang'; serviceCode = 'SND'; }
    if (window.APP.service === 'FOOD_MART') { displayService = 'Food & Mart'; serviceCode = 'JST'; }
    if (window.APP.service === 'CAR') { displayService = 'Mobil'; serviceCode = 'CAR'; }

    const orderID = `${serviceCode}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    let msg = `Halo Kak! Order ${displayService}\n` +
        `ID: ${orderID}\n` +
        `----------------\n` +
        `Asal: ${originVal}\n` +
        `(GPS: ${orgLat}, ${orgLng})\n` +
        `Tujuan: ${destVal}\n` +
        `(GPS: ${destLat}, ${destLng})\n`;

    const note = document.getElementById('note').value;
    if (note) msg += `Catatan: ${note}\n`;

    if (window.APP.service === 'FOOD_MART') {
        const items = document.getElementById('items').value;
        const estPrice = document.getElementById('est-price').value;
        msg += `----------------\n` +
            `Item: ${items}\n` +
            `Est. Harga: Rp ${estPrice || 0}\n`;
    }

    if (window.APP.service === 'CAR') {
        const seatLabel = window.APP.carOptions.seats === 6 ? '6 Seat' : '4 Seat';
        const tollLabel = window.APP.carOptions.toll ? 'Yes' : 'No';
        msg += `----------------\n` +
            `[${seatLabel}]\n` +
            `Via Tol: ${tollLabel}\n`;
    }

    msg += `----------------\n` +
        `Jarak: ${window.APP.calc.distance} km\n` +
        `Ongkir: Rp ${price.toLocaleString('id-ID')}\n` +
        `================\n` +
        `Gas jemput?`;

    btn.classList.remove('disabled');
    textBtn.innerText = `GAS ORDER • Rp ${price.toLocaleString('id-ID')}`;
    btn.href = 'https://wa.me/' + CONFIG_WA + '?text=' + encodeURIComponent(msg);

    if (window.APP.places.origin && window.APP.places.dest) {
        const history = {
            origin_addr: originVal, origin_lat: orgLat, origin_lng: orgLng,
            dest_addr: destVal, dest_lat: destLat, dest_lng: destLng,
            note: note
        };
        localStorage.setItem('bantujeg_history', JSON.stringify(history));
    }
}

function setService(type, el) {
    window.APP.service = type;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    else document.querySelector('.tab').classList.add('active');

    document.getElementById('origin').value = '';
    document.getElementById('destination').value = '';
    document.getElementById('note').value = '';
    document.getElementById('items').value = '';
    document.getElementById('est-price').value = '';

    window.APP.places = { origin: null, dest: null };
    if (window.APP.markers.origin) window.APP.markers.origin.setMap(null);
    if (window.APP.markers.dest) window.APP.markers.dest.setMap(null);
    window.APP.markers = { origin: null, dest: null };
    window.APP.calc = { distance: 0, price: 0 };
    window.APP.carOptions = { seats: 4, toll: false };

    // CLEAR ROUTE LINE
    if (window.APP.directionsRenderer) {
        window.APP.directionsRenderer.setDirections({ routes: [] });
    }

    document.getElementById('price-card').style.display = 'none';
    document.getElementById('error-card').style.display = 'none';
    toggleClearBtn('origin');
    toggleClearBtn('destination');
    toggleClearBtn('note');

    const jastipField = document.getElementById('jastip-field');
    const legalWarning = document.getElementById('legal-warning');
    const originInput = document.getElementById('origin');
    const destInput = document.getElementById('destination');
    const carOptions = document.getElementById('car-options');
    const carSeatDefault = document.querySelector('input[name="car-seat"][value="4"]');
    const carToll = document.getElementById('car-toll');

    const gpsOrigin = document.getElementById('gps-origin');
    const gpsDestination = document.getElementById('gps-destination');

    gpsOrigin.style.display = 'none';
    gpsDestination.style.display = 'none';

    jastipField.style.display = 'none';
    legalWarning.style.display = 'none';
    carOptions.style.display = 'none';
    if (carSeatDefault) carSeatDefault.checked = true;
    if (carToll) carToll.checked = false;

    if (type === 'FOOD_MART') {
        jastipField.style.display = 'block';
        gpsDestination.style.display = 'flex';
        originInput.placeholder = "Beli di mana? (Nama Warung/Toko)";
        destInput.placeholder = "Antar ke mana? (Lokasi Kamu)";
    } else if (type === 'SEND') {
        legalWarning.style.display = 'block';
        gpsOrigin.style.display = 'flex';
        originInput.placeholder = "Ambil paket di mana?";
        destInput.placeholder = "Kirim ke mana?";
    } else if (type === 'CAR') {
        carOptions.style.display = 'block';
        gpsOrigin.style.display = 'flex';
        originInput.placeholder = "Jemput di mana? (Cari Hotel/Mall)";
        destInput.placeholder = "Antar ke mana?";
    } else {
        gpsOrigin.style.display = 'flex';
        originInput.placeholder = "Jemput di mana? (Cari Masjid/Sekolah)";
        destInput.placeholder = "Antar ke mana?";
    }

    const mapSettings = getServiceMapSettings(type);
    if (window.APP.map) {
        window.APP.map.setCenter(mapSettings.center);
        window.APP.map.setZoom(mapSettings.zoom);
    }

    updateLink();
}

window.handleCarOptionChange = function () {
    const selected = document.querySelector('input[name="car-seat"][checked]');
    // Note: In original code checked might not be updated by browser in DOM, but here we query selector.
    // Better to use :checked
    const realSelected = document.querySelector('input[name="car-seat"]:checked');
    const seatValue = realSelected ? parseInt(realSelected.value, 10) : 4;
    const tollValue = document.getElementById('car-toll').checked;

    window.APP.carOptions.seats = seatValue;
    window.APP.carOptions.toll = tollValue;

    if (window.APP.places.origin && window.APP.places.dest) {
        calculateRoute();
    } else if (window.APP.calc.distance > 0) {
        calculatePrice(window.APP.calc.distance);
    } else {
        updateLink();
    }
}

function expandMap() {
    document.getElementById('map-container').classList.add('expanded');
}

function setLoading(state) {
    const spin = document.getElementById('loading-spin');
    const txt = document.getElementById('btn-text');
    if (state) {
        spin.style.display = 'block';
        txt.style.display = 'none';
    } else {
        spin.style.display = 'none';
        txt.style.display = 'block';
    }
}

// 🔒 TRANSACTIONAL STATE MACHINE - OPEN
window.openMapPicker = function (type) {
    // ACTIVATE LOCK - No external writes allowed
    window.APP.picker.locked = true;
    window.APP.picker.activeField = type === 'origin' ? 'pickup' : 'dropoff';

    const modal = document.getElementById('map-picker-modal');
    modal.classList.add('active');

    if (type === 'origin') {
        document.getElementById('picker-title').innerText = 'Tentukan Titik Jemput';
        document.getElementById('pin-label').innerText = 'Lokasi Jemput';
    } else {
        document.getElementById('picker-title').innerText = 'Tentukan Tujuan';
        document.getElementById('pin-label').innerText = 'Lokasi Tujuan';
    }

    // Reset address display
    document.getElementById('picker-address').innerText = 'Geser peta untuk memilih lokasi...';

    if (!window.APP.pickerMap) {
        const mapSettings = getServiceMapSettings(window.APP.service);
        window.APP.pickerMap = new google.maps.Map(document.getElementById("picker-map"), {
            center: mapSettings.center,
            zoom: mapSettings.zoom + 4,
            gestureHandling: "greedy",
            disableDefaultUI: true,
            clickableIcons: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false
        });

        // 🛰 SILENT IDLE TRACKING - No geocode, no UI update, just state
        window.APP.pickerMap.addListener('idle', function () {
            const center = window.APP.pickerMap.getCenter();
            window.APP.picker.currentLocation = {
                lat: center.lat(),
                lng: center.lng()
            };
        });
    }

    // FIX JITTER: Wait for modal animation to complete (300ms)
    setTimeout(() => {
        google.maps.event.trigger(window.APP.pickerMap, "resize");

        // 🧭 SAFE INITIALIZATION - Priority: existing > GPS > default
        const field = type === 'origin' ? 'origin' : 'dest';
        const existingPlace = window.APP.places[field];
        const mapSettings = getServiceMapSettings(window.APP.service);

        if (existingPlace && existingPlace.geometry) {
            // Use existing confirmed location
            const lat = existingPlace.geometry.location.lat();
            const lng = existingPlace.geometry.location.lng();
            window.APP.picker.currentLocation = { lat, lng };
            window.APP.pickerMap.setCenter({ lat, lng });
            window.APP.pickerMap.setZoom(18);
        } else if (navigator.geolocation) {
            // Try GPS for initial position
            window.APP.picker.currentLocation = mapSettings.center; // Fallback immediately
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    window.APP.picker.currentLocation = { lat, lng };
                    window.APP.pickerMap.setCenter({ lat, lng });
                    window.APP.pickerMap.setZoom(18);
                },
                () => {
                    window.APP.pickerMap.setCenter(mapSettings.center);
                    window.APP.pickerMap.setZoom(mapSettings.zoom + 4);
                }
            );
        } else {
            // Default to Salatiga center
            window.APP.picker.currentLocation = mapSettings.center;
            window.APP.pickerMap.setCenter(mapSettings.center);
            window.APP.pickerMap.setZoom(mapSettings.zoom + 4);
        }
    }, 300);

    history.pushState({ mapPicker: true }, '', '');
}

// 🔒 TRANSACTIONAL STATE MACHINE - CLOSE (releases lock)
window.closeMapPicker = function () {
    const modal = document.getElementById('map-picker-modal');
    modal.classList.remove('active');

    // RELEASE LOCK - External writers allowed again
    window.APP.picker.locked = false;
    window.APP.picker.activeField = null;

    if (history.state && history.state.mapPicker) {
        history.back();
    }
}

// DISABLED: This function caused DOM reflow loop and map jitter
// Live geocoding during drag triggers layout recalculation
function handlePickerMapIdle() {
    const center = window.APP.pickerMap.getCenter();
    const lat = center.lat();
    const lng = center.lng();

    // Only update coordinates, DO NOT update text (prevents jitter)
    window.APP.picker.currentLocation = { lat, lng };

    // DISABLED: No live geocoding
    // if (window.APP.picker.geocodeTimer) {
    //     clearTimeout(window.APP.picker.geocodeTimer);
    // }
    // window.APP.picker.geocodeTimer = setTimeout(() => {
    //     performReverseGeocode(lat, lng);
    // }, 500);
}

// Geocode ONLY on button press - not during drag
function performReverseGeocode(lat, lng, callback) {
    if (window.APP.picker.geocodeRequest) {
        window.APP.picker.geocodeRequest = null;
    }

    const geocoder = new google.maps.Geocoder();
    const requestId = Date.now();
    window.APP.picker.geocodeRequest = requestId;

    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (window.APP.picker.geocodeRequest !== requestId) {
            return;
        }

        if (status === "OK" && results[0]) {
            const address = cleanAddress(results[0].formatted_address);
            if (callback) callback(address);
        } else {
            if (callback) callback(null);
        }
    });
}

// 🔐 TRANSACTIONAL STATE MACHINE - COMMIT (single write path)
window.confirmLocation = function () {
    const activeField = window.APP.picker.activeField;
    const loc = window.APP.picker.currentLocation;

    if (!activeField || !loc) return;

    // Freeze location for commit
    const lat = loc.lat;
    const lng = loc.lng;
    const type = activeField === 'pickup' ? 'origin' : 'destination';

    // Disable button during geocode
    const confirmBtn = document.getElementById('confirm-btn');
    const addressDisplay = document.getElementById('picker-address');
    confirmBtn.disabled = true;
    addressDisplay.innerText = 'Mencari alamat...';

    // Step 1: Reverse geocode once
    performReverseGeocode(lat, lng, (address) => {
        confirmBtn.disabled = false;

        if (!address) {
            addressDisplay.innerText = 'Gagal mendapatkan alamat. Coba lagi.';
            return;
        }

        // Step 2: Update input field (display only)
        document.getElementById(type).value = address;
        toggleClearBtn(type);

        // Step 3: COMMIT to central state - this is the ONLY write path
        updateLocationState(activeField, lat, lng, 'manual', address);

        // Step 4: Update main map marker
        const markerType = activeField === 'pickup' ? 'origin' : 'dest';
        updateMarker(markerType, lat, lng);
        expandMap();

        // Step 5: Calculate route if both locations set
        if (window.APP.places.origin && window.APP.places.dest) {
            calculateRoute();
        }

        // Step 6: Close picker (this releases the lock)
        closeMapPicker();
    });
}

window.addEventListener('popstate', function (event) {
    const modal = document.getElementById('map-picker-modal');
    if (modal.classList.contains('active')) {
        closeMapPicker();
        event.preventDefault();
    }
});

// Explicit Exports to Window for Legacy Compatibility
window.getServiceMapSettings = getServiceMapSettings;
window.initMap = initMap;
window.checkHistory = checkHistory;
window.cleanAddress = cleanAddress;
window.updateLocationState = updateLocationState;
window.updateMarker = updateMarker;
window.initAutocomplete = initAutocomplete;
window.handlePlaceSelect = handlePlaceSelect;
window.calculateRoute = calculateRoute;
window.showError = showError;
window.calculatePrice = calculatePrice;
window.updateLink = updateLink;
window.setService = setService;
window.expandMap = expandMap;
window.setLoading = setLoading;
window.handlePickerMapIdle = handlePickerMapIdle;
window.performReverseGeocode = performReverseGeocode;
window.openMapPicker = openMapPicker;
window.closeMapPicker = closeMapPicker;
window.confirmLocation = confirmLocation;
window.getCurrentLocation = getCurrentLocation;
window.handleInput = handleInput;
window.clearInput = clearInput;
window.toggleClearBtn = toggleClearBtn;
window.addNote = addNote;
window.useHistory = useHistory;
window.handleCarOptionChange = handleCarOptionChange;
window.setActiveField = setActiveField;

// Auto-Init Map if Google is ready (since script is deferred now)
if (window.google && window.google.maps) {
    initMap();
    initAutocomplete();
} else {
    // Fallback if GMaps loads slower than this module
    window.initMapCallback = function () {
        initMap();
        initAutocomplete();
    };
}

