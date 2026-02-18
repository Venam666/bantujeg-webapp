/* ========================
   app.js - The Business Cables
   ======================== */

// 1. Define Central Namespaces & Global State
window.APP = {
    // --- Global State ---
    service: 'RIDE',
    config: { RIDE: null, FOOD_MART: null, SEND: null, CAR: null },

    // Application Data
    places: { origin: null, dest: null },
    calc: { distance: 0, price: 0 },

    // Map Stuff (initialized by map.js later)
    map: null,
    pickerMap: null,
    directionsRenderer: null,
    markers: { origin: null, dest: null },

    historyData: null,
    carOptions: { seats: 4, toll: false },

    picker: {
        activeField: null,
        currentLocation: null,
        locked: false,
        geocodeRequest: null
    },

    // UI & Location State - Shared globally
    state: {
        pickup: { lat: null, lng: null, source: null, address: '' },
        dropoff: { lat: null, lng: null, source: null, address: '' }
    },

    // --- Methods ---

    // Update tab UI and APP.service
    setService: function (type, el) {
        console.log('Setting service to:', type);
        window.APP.service = type; // Sync internal state

        // UI Updates
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        if (el) {
            el.classList.add('active');
        } else {
            // Find tab by text content if el not passed (fallback)
            // Or just ignore highlighting if auto-set
        }

        // Reset inputs
        const inputs = ['origin', 'destination', 'note', 'items', 'est-price'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Reset app logic state
        window.APP.places = { origin: null, dest: null };

        // Clear map markers
        if (window.APP.markers.origin) window.APP.markers.origin.setMap(null);
        if (window.APP.markers.dest) window.APP.markers.dest.setMap(null);
        window.APP.markers = { origin: null, dest: null };

        window.APP.calc = { distance: 0, price: 0 };
        window.APP.carOptions = { seats: 4, toll: false };

        window.APP.state.pickup = { lat: null, lng: null, source: null, address: '' };
        window.APP.state.dropoff = { lat: null, lng: null, source: null, address: '' };

        if (window.APP.directionsRenderer) {
            window.APP.directionsRenderer.setDirections({ routes: [] });
        }

        const priceCard = document.getElementById('price-card');
        const errorCard = document.getElementById('error-card');
        if (priceCard) priceCard.style.display = 'none';
        if (errorCard) errorCard.style.display = 'none';

        // Helper from map.js (ensure it exists)
        if (window.toggleClearBtn) {
            toggleClearBtn('origin');
            toggleClearBtn('destination');
            toggleClearBtn('note');
        }

        // Service-specific UI logic
        var jastipField = document.getElementById('jastip-field');
        var legalWarning = document.getElementById('legal-warning');
        var originInput = document.getElementById('origin');
        var destInput = document.getElementById('destination');
        var carOptions = document.getElementById('car-options');
        var carSeatDef = document.querySelector('input[name="car-seat"][value="4"]');
        var carToll = document.getElementById('car-toll');
        var gpsOrigin = document.getElementById('gps-origin');
        var gpsDest = document.getElementById('gps-destination');

        if (gpsOrigin) gpsOrigin.style.display = 'none';
        if (gpsDest) gpsDest.style.display = 'none';
        if (jastipField) jastipField.style.display = 'none';
        if (legalWarning) legalWarning.style.display = 'none';
        if (carOptions) carOptions.style.display = 'none';

        if (carSeatDef) carSeatDef.checked = true;
        if (carToll) carToll.checked = false;

        if (type === 'FOOD_MART') {
            if (jastipField) jastipField.style.display = 'block';
            if (gpsDest) gpsDest.style.display = 'flex';
            if (originInput) originInput.placeholder = 'Beli di mana? (Nama Warung/Toko)';
            if (destInput) destInput.placeholder = 'Antar ke mana? (Lokasi Kamu)';
        } else if (type === 'SEND') {
            if (legalWarning) legalWarning.style.display = 'block';
            if (gpsOrigin) gpsOrigin.style.display = 'flex';
            if (originInput) originInput.placeholder = 'Ambil paket di mana?';
            if (destInput) destInput.placeholder = 'Kirim ke mana?';
        } else if (type === 'CAR') {
            if (carOptions) carOptions.style.display = 'block';
            if (gpsOrigin) gpsOrigin.style.display = 'flex';
            if (originInput) originInput.placeholder = 'Jemput di mana? (Cari Hotel/Mall)';
            if (destInput) destInput.placeholder = 'Antar ke mana?';
        } else { // RIDE
            if (gpsOrigin) gpsOrigin.style.display = 'flex';
            if (originInput) originInput.placeholder = 'Jemput di mana? (Cari Masjid/Sekolah)';
            if (destInput) destInput.placeholder = 'Antar ke mana?';
        }

        // Reset map view to configured default for service
        if (window.getServiceMapSettings && window.APP.map) {
            var mapSettings = window.getServiceMapSettings(type);
            window.APP.map.setCenter(mapSettings.center);
            window.APP.map.setZoom(mapSettings.zoom);
        }

        if (window.updateLink) window.updateLink();
    },

    // Submit Order
    submitOrder: function () {
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        var spinner = document.getElementById('loading-spin');

        if (btn.classList.contains('disabled')) return;

        var payment = document.getElementById('payment-method').value;
        const originInput = document.getElementById('origin');
        const destInput = document.getElementById('destination');
        const noteInput = document.getElementById('note');

        // Sync STATE from APP.places (double check)
        if (window.APP.places.origin && window.APP.places.origin.geometry) {
            var ol = window.APP.places.origin.geometry.location;
            window.APP.state.pickup.lat = ol.lat();
            window.APP.state.pickup.lng = ol.lng();
            window.APP.state.pickup.address = originInput.value.trim();
        }
        if (window.APP.places.dest && window.APP.places.dest.geometry) {
            var dl = window.APP.places.dest.geometry.location;
            window.APP.state.dropoff.lat = dl.lat();
            window.APP.state.dropoff.lng = dl.lng();
            window.APP.state.dropoff.address = destInput.value.trim();
        }

        // Validate Coordinates
        if (!window.APP.state.pickup.lat || !window.APP.state.dropoff.lat) {
            alert('Lokasi belum lengkap. Mohon pilih lokasi lewat peta atau autocomplete.');
            return;
        }

        // Prepare Payload - MATCH SCHEMA EXACTLY
        // { service, customer_phone, pickupLocation: {lat, lng}, dropoffLocation: {lat, lng}, origin, destination, paymentMethod, note }
        var payload = {
            service: window.APP.service,
            customer_phone: localStorage.getItem('bj_phone'),
            session_key: localStorage.getItem('bj_token'),
            pickupLocation: {
                lat: window.APP.state.pickup.lat,
                lng: window.APP.state.pickup.lng
            },
            dropoffLocation: {
                lat: window.APP.state.dropoff.lat,
                lng: window.APP.state.dropoff.lng
            },
            origin: window.APP.state.pickup.address,
            destination: window.APP.state.dropoff.address,
            paymentMethod: payment,
            note: noteInput.value
        };

        // Add FOOD_MART extras
        if (window.APP.service === 'FOOD_MART') {
            payload.items = document.getElementById('items').value;
            payload.estPrice = document.getElementById('est-price').value;
        }

        // Add CAR extras
        if (window.APP.service === 'CAR') {
            payload.carSeats = window.APP.carOptions.seats;
            payload.viaToll = window.APP.carOptions.toll;
        }

        // Show loading state
        btn.classList.add('disabled');
        spinner.style.display = 'block';
        btnText.style.display = 'none';

        var endpoint = payment === 'QRIS'
            ? window.API_URL + '/orders/qris'
            : window.API_URL + '/orders/create';

        console.log('Submitting Order:', payload);

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                if (!res.ok) {
                    return res.text().then(function (text) {
                        console.error('Order Failed:', res.status, text.substring(0, 100));
                        throw new Error('Server responded with ' + res.status);
                    });
                }
                return res.json();
            })
            .then(function (data) {
                spinner.style.display = 'none';
                btnText.style.display = 'block';
                btn.classList.remove('disabled');

                if (data && data.success) {
                    alert('✅ Order berhasil dibuat! Driver segera menjemput kamu.');
                    // Save history
                    localStorage.setItem('bantujeg_history', JSON.stringify({
                        origin_addr: window.APP.state.pickup.address,
                        origin_lat: window.APP.state.pickup.lat,
                        origin_lng: window.APP.state.pickup.lng,
                        dest_addr: window.APP.state.dropoff.address,
                        dest_lat: window.APP.state.dropoff.lat,
                        dest_lng: window.APP.state.dropoff.lng,
                        note: payload.note
                    }));
                } else {
                    alert('❌ Gagal buat order: ' + (data.message || 'Coba lagi ya.'));
                }
            })
            .catch(function (err) {
                spinner.style.display = 'none';
                btnText.style.display = 'block';
                btn.classList.remove('disabled');
                console.error('Order error:', err);
                alert('❌ Gagal terhubung ke server. Cek koneksi kamu.');
            });
    }
};

// 2. Export Global Functions to Window (CRITICAL)
// These MUST be on window so onclick="" works in HTML
window.setService = window.APP.setService;
window.submitOrder = window.APP.submitOrder;

// 3. Backward Compatibility
window.STATE = window.APP.state;
