// ========================
// app.js - The Business Cables
// ========================

var BACKEND_URL = 'https://YOUR_BACKEND_URL'; // 🔧 Replace with your actual backend URL

// --- Global State ---
window.STATE = {
    service: 'RIDE',
    pickup:  { lat: null, lng: null, address: '' },
    dropoff: { lat: null, lng: null, address: '' }
};

// --- setService: Update tab UI and STATE.service ---
window.setService = function(type, el) {
    window.STATE.service = type;
    window.APP.service = type; // keep map.js in sync

    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    if (el) el.classList.add('active');

    // Reset inputs
    document.getElementById('origin').value = '';
    document.getElementById('destination').value = '';
    document.getElementById('note').value = '';
    document.getElementById('items').value = '';
    document.getElementById('est-price').value = '';

    // Reset app state
    window.APP.places = { origin: null, dest: null };
    if (window.APP.markers.origin) window.APP.markers.origin.setMap(null);
    if (window.APP.markers.dest)   window.APP.markers.dest.setMap(null);
    window.APP.markers = { origin: null, dest: null };
    window.APP.calc = { distance: 0, price: 0 };
    window.APP.carOptions = { seats: 4, toll: false };

    window.STATE.pickup  = { lat: null, lng: null, address: '' };
    window.STATE.dropoff = { lat: null, lng: null, address: '' };

    if (window.APP.directionsRenderer) {
        window.APP.directionsRenderer.setDirections({ routes: [] });
    }

    document.getElementById('price-card').style.display = 'none';
    document.getElementById('error-card').style.display = 'none';
    toggleClearBtn('origin');
    toggleClearBtn('destination');
    toggleClearBtn('note');

    // Service-specific UI
    var jastipField   = document.getElementById('jastip-field');
    var legalWarning  = document.getElementById('legal-warning');
    var originInput   = document.getElementById('origin');
    var destInput     = document.getElementById('destination');
    var carOptions    = document.getElementById('car-options');
    var carSeatDef    = document.querySelector('input[name="car-seat"][value="4"]');
    var carToll       = document.getElementById('car-toll');
    var gpsOrigin     = document.getElementById('gps-origin');
    var gpsDest       = document.getElementById('gps-destination');

    gpsOrigin.style.display = 'none';
    gpsDest.style.display   = 'none';
    jastipField.style.display  = 'none';
    legalWarning.style.display = 'none';
    carOptions.style.display   = 'none';
    if (carSeatDef) carSeatDef.checked = true;
    if (carToll)    carToll.checked = false;

    if (type === 'FOOD_MART') {
        jastipField.style.display = 'block';
        gpsDest.style.display = 'flex';
        originInput.placeholder = 'Beli di mana? (Nama Warung/Toko)';
        destInput.placeholder   = 'Antar ke mana? (Lokasi Kamu)';
    } else if (type === 'SEND') {
        legalWarning.style.display = 'block';
        gpsOrigin.style.display = 'flex';
        originInput.placeholder = 'Ambil paket di mana?';
        destInput.placeholder   = 'Kirim ke mana?';
    } else if (type === 'CAR') {
        carOptions.style.display = 'block';
        gpsOrigin.style.display = 'flex';
        originInput.placeholder = 'Jemput di mana? (Cari Hotel/Mall)';
        destInput.placeholder   = 'Antar ke mana?';
    } else { // RIDE
        gpsOrigin.style.display = 'flex';
        originInput.placeholder = 'Jemput di mana? (Cari Masjid/Sekolah)';
        destInput.placeholder   = 'Antar ke mana?';
    }

    // Reset map view
    var mapSettings = getServiceMapSettings(type);
    if (window.APP.map) {
        window.APP.map.setCenter(mapSettings.center);
        window.APP.map.setZoom(mapSettings.zoom);
    }

    updateLink();
};

// --- submitOrder: POST order to backend ---
window.submitOrder = function() {
    var btn     = document.getElementById('btn-submit');
    var btnText = document.getElementById('btn-text');
    var spinner = document.getElementById('loading-spin');

    if (btn.classList.contains('disabled')) return;

    var payment = document.getElementById('payment-method').value;

    // Sync STATE from APP.places (map.js writes to APP.places)
    if (window.APP.places.origin && window.APP.places.origin.geometry) {
        var ol = window.APP.places.origin.geometry.location;
        window.STATE.pickup.lat = ol.lat();
        window.STATE.pickup.lng = ol.lng();
        window.STATE.pickup.address = document.getElementById('origin').value.trim();
    }
    if (window.APP.places.dest && window.APP.places.dest.geometry) {
        var dl = window.APP.places.dest.geometry.location;
        window.STATE.dropoff.lat = dl.lat();
        window.STATE.dropoff.lng = dl.lng();
        window.STATE.dropoff.address = document.getElementById('destination').value.trim();
    }

    var payload = {
        service:         window.STATE.service,
        customer_phone:  localStorage.getItem('bj_phone'),
        session_key:     localStorage.getItem('bj_token'),
        pickupLocation:  { lat: window.STATE.pickup.lat,  lng: window.STATE.pickup.lng  },
        dropoffLocation: { lat: window.STATE.dropoff.lat, lng: window.STATE.dropoff.lng },
        origin:          window.STATE.pickup.address,
        destination:     window.STATE.dropoff.address,
        paymentMethod:   payment,
        note:            document.getElementById('note').value
    };

    // Add FOOD_MART extras
    if (window.STATE.service === 'FOOD_MART') {
        payload.items    = document.getElementById('items').value;
        payload.estPrice = document.getElementById('est-price').value;
    }

    // Add CAR extras
    if (window.STATE.service === 'CAR') {
        payload.carSeats = window.APP.carOptions.seats;
        payload.viaToll  = window.APP.carOptions.toll;
    }

    // Show loading state
    btn.classList.add('disabled');
    spinner.style.display = 'block';
    btnText.style.display = 'none';

    var endpoint = payment === 'QRIS'
        ? BACKEND_URL + '/orders/qris'
        : BACKEND_URL + '/orders/create';

    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        spinner.style.display = 'none';
        btnText.style.display = 'block';
        btn.classList.remove('disabled');

        if (data && data.success) {
            alert('✅ Order berhasil dibuat! Driver segera menjemput kamu.');
            // Save history
            localStorage.setItem('bantujeg_history', JSON.stringify({
                origin_addr: window.STATE.pickup.address,
                origin_lat:  window.STATE.pickup.lat,
                origin_lng:  window.STATE.pickup.lng,
                dest_addr:   window.STATE.dropoff.address,
                dest_lat:    window.STATE.dropoff.lat,
                dest_lng:    window.STATE.dropoff.lng,
                note:        payload.note
            }));
        } else {
            alert('❌ Gagal buat order: ' + (data.message || 'Coba lagi ya.'));
        }
    })
    .catch(function(err) {
        spinner.style.display = 'none';
        btnText.style.display = 'block';
        btn.classList.remove('disabled');
        console.error('Order error:', err);
        alert('❌ Gagal terhubung ke server. Cek koneksi kamu.');
    });
};

// --- updateLink: Enable/disable the submit button ---
window.updateLink = function() {
    var btn     = document.getElementById('btn-submit');
    var btnText = document.getElementById('btn-text');
    var price   = window.APP && window.APP.calc ? window.APP.calc.price : 0;

    var originVal = document.getElementById('origin').value.trim();
    var destVal   = document.getElementById('destination').value.trim();

    if (price === 0 || originVal === '' || destVal === '') {
        btn.classList.add('disabled');
        btnText.innerText = 'Isi Lokasi Dulu';
        return;
    }

    btn.classList.remove('disabled');
    btnText.innerText = 'GAS ORDER • Rp ' + price.toLocaleString('id-ID');
};
