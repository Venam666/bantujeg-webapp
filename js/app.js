/* ========================
   app.js - The Brains
   ======================== */

window.APP = {
    service: 'RIDE',
    state: {
        pickup: { lat: null, lng: null, source: null, address: '' },
        dropoff: { lat: null, lng: null, source: null, address: '' }
    },
    // Config will be loaded from backend, falling back if needed
    config: {},
    places: { origin: null, dest: null },
    markers: { origin: null, dest: null },
    calc: { distance: 0, price: 0, duration: 0 },
    picker: {
        activeField: null,
        currentLocation: null,
        locked: false,
        geocodeRequest: null
    },
    carOptions: { seats: 4, toll: false },
    // Global Cache for History
    historyData: null
};

// ─── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    // Note: Main init is triggered by Maps callback (initMap)
    // But we can init some UI listeners here

    // Service Tabs
    document.querySelectorAll('.tab').forEach(function (el) {
        el.addEventListener('click', function () {
            window.setService(this.dataset.service, this);
        });
    });

    // Mobile Menu
    var menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', function () {
            alert('Menu fitur belum tersedia di MVP ini.');
        });
    }

    // Default to RIDE
    window.setService('RIDE', document.querySelector('.tab[data-service="RIDE"]'));
});

// ─── SERVICE SWITCHING ──────────────────────────────────────────────────────
window.setService = function (serviceName, el) {
    if (!serviceName) return;

    window.APP.service = serviceName;

    // UI Updates
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    // Show/Hide Service Options
    var extras = document.getElementById('food-mart-extras');
    var carOpts = document.getElementById('car-options');

    if (extras) extras.style.display = (serviceName === 'FOOD_MART' || serviceName === 'FOOD' || serviceName === 'MART') ? 'block' : 'none';
    if (carOpts) carOpts.style.display = (serviceName === 'CAR') ? 'block' : 'none';

    // Update Map Route & Price if points exist
    if (window.APP.places.origin && window.APP.places.dest) {
        // Recalculate everything
        if (window.APP_MAP && window.APP_MAP.drawRoute) {
            window.APP_MAP.drawRoute();
        }
    } else {
        // Just update placeholder pricing logic locally if needed? 
        // No, map.js handles price display. 
        // Just hide price card if invalid
        var priceCard = document.getElementById('price-card');
        if (priceCard) priceCard.style.display = 'none';
    }

    // Update WhatsApp Link (Deep Link)
    window.updateLink();
};

window.updateLink = function () {
    // This function generates the "Legacy" WA link as a backup
    // But mostly we rely on submitOrder() now.
    // We can leave it empty or just minimal update.
    // For MVP, we stick to API calls.
};

// ─── ORDER SUBMISSION ───────────────────────────────────────────────────────
window.submitOrder = function () {
    // 1. Validation
    if (!window.APP.state.pickup.lat || !window.APP.state.dropoff.lat) {
        alert('Mohon lengkapi lokasi jemput dan tujuan dulu ya!');
        return;
    }

    if (!window.APP.calc.price || window.APP.calc.price === 0) {
        alert('Mohon tunggu estimasi harga muncul.');
        return;
    }

    var paymentSelect = document.getElementById('payment-method');
    var paymentMethod = paymentSelect ? paymentSelect.value : 'CASH';

    // 2. Prepare Payload
    // Note: We use window.API_URL from auth.js
    var apiUrl = window.API_URL || 'http://localhost:8080';
    var token = localStorage.getItem('bj_token');

    // 3. Payment Flow Branching
    if (paymentMethod === 'QRIS') {
        // Open QRIS Modal
        window.openQrisModal();
    } else {
        // CASH -> Direct Submit
        window.processOrder('CASH');
    }
};

// ─── QRIS LOGIC ─────────────────────────────────────────────────────────────
window.openQrisModal = function () {
    var modal = document.getElementById('modal-qris');
    var amountEl = document.getElementById('qris-amount');

    if (modal && amountEl) {
        amountEl.innerText = 'Rp ' + (window.APP.calc.price || 0).toLocaleString('id-ID');
        modal.classList.remove('hidden');
    }
};

window.closeQrisModal = function () {
    var modal = document.getElementById('modal-qris');
    if (modal) modal.classList.add('hidden');
};

window.finishQrisPayment = function () {
    // User claims they paid.
    // In a real app, we might poll for status.
    // For MVP, we trust the user click and send the order to /qris endpoint
    window.processOrder('QRIS');
};

// ─── API PROCESSOR ──────────────────────────────────────────────────────────
window.processOrder = function (method) {
    if (window.isSubmitting) return;
    window.isSubmitting = true;

    var btn = method === 'QRIS' ? document.getElementById('btn-qris-done') : document.getElementById('btn-submit');
    var originalText = btn ? btn.innerText : '';
    if (btn) btn.innerText = '⏳ Memproses...';
    if (btn) btn.disabled = true;

    var apiUrl = (window.API_URL || 'http://localhost:8080');
    var endpoint = method === 'QRIS' ? '/orders/qris' : '/orders/create';

    var payload = {
        service: window.APP.service,
        customer_phone: localStorage.getItem('bj_phone') || '080000000000',
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
        note: document.getElementById('note').value,
        price: window.APP.calc.price // Optional hint to backend
    };

    if (method === 'CASH') {
        payload.paymentMethod = 'CASH';
    }

    // Service Extras
    if (window.APP.service === 'FOOD_MART') {
        payload.items = document.getElementById('items').value;
        payload.estPrice = document.getElementById('est-price').value;
    }

    console.log('Sending Order:', payload);

    fetch(apiUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(async function (res) {
            // Pre-flight check for Vercel 404s
            if (!res.ok) {
                console.error('API Error Status:', res.status);
                var text = await res.text();
                console.error('API Error Body:', text.substring(0, 100)); // Log first 100 chars
                try { return JSON.parse(text); } catch (e) { throw new Error('Server Error: ' + res.status); }
            }
            return res.json();
        })
        .then(function (data) {
            window.isSubmitting = false;
            if (btn) btn.innerText = originalText;
            if (btn) btn.disabled = false;
            if (method === 'QRIS') window.closeQrisModal();

            if (data && (data.success || data.orderId)) {
                // Success! Redirect or Show Success
                var whatsappUrl = data.whatsappUrl || data.wa_link; // Handle both formats
                if (whatsappUrl) {
                    window.location.href = whatsappUrl;
                } else {
                    alert('Order berhasil dibuat! ID: ' + (data.orderId || data.id));
                }
            } else {
                alert('Gagal membuat order: ' + (data.message || 'Unknown error'));
            }
        })
        .catch(function (error) {
            window.isSubmitting = false;
            if (btn) btn.innerText = originalText;
            if (btn) btn.disabled = false;
            if (method === 'QRIS') window.closeQrisModal();

            console.error('Submit Error:', error);
            alert('Terjadi kesalahan koneksi. Silakan coba lagi.');
        });
};
