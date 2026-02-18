/* ========================
   app.js - The Brains
   ======================== */

window.APP = {
    service: 'RIDE',
    state: {
        pickup: { lat: null, lng: null, source: null, address: '' },
        dropoff: { lat: null, lng: null, source: null, address: '' }
    },
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
    historyData: null,

    // New Helper: Centralized API Sender
    sendOrderToBackend: function (payload, endpoint) {
        if (window.isSubmitting) return;
        window.isSubmitting = true;

        var btn = document.getElementById('btn-submit');
        var qrisBtn = document.getElementById('btn-qris-done');
        var activeBtn = endpoint.includes('qris') ? qrisBtn : btn;

        var originalText = activeBtn ? activeBtn.innerText : '';
        if (activeBtn) {
            activeBtn.innerText = '⏳ Memproses...';
            activeBtn.disabled = true;
        }

        var apiUrl = (window.API_URL || 'http://localhost:8080');

        console.log('Sending Order to ' + endpoint, payload);

        fetch(apiUrl + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(async function (res) {
                if (!res.ok) {
                    var text = await res.text();
                    console.error('API Error Body:', text);
                    try { return JSON.parse(text); } catch (e) { throw new Error('Server Error: ' + res.status); }
                }
                return res.json();
            })
            .then(function (data) {
                window.isSubmitting = false;
                if (activeBtn) {
                    activeBtn.innerText = originalText;
                    activeBtn.disabled = false;
                }

                if (data && (data.success || data.orderId)) {
                    // Success! Redirect or Show Success
                    var whatsappUrl = data.whatsappUrl || data.wa_link;
                    if (whatsappUrl) {
                        window.location.href = whatsappUrl;
                    } else {
                        alert('Order berhasil dibuat! ID: ' + (data.orderId || data.id));
                        // Optional: Reset form
                    }
                } else {
                    alert('Gagal membuat order: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(function (error) {
                window.isSubmitting = false;
                if (activeBtn) {
                    activeBtn.innerText = originalText;
                    activeBtn.disabled = false;
                }
                console.error('Submit Error:', error);
                alert('Terjadi kesalahan koneksi. Silakan coba lagi.');
            });
    }
};

// ─── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
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
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    var extras = document.getElementById('food-mart-extras');
    var carOpts = document.getElementById('car-options');
    if (extras) extras.style.display = (serviceName === 'FOOD_MART' || serviceName === 'FOOD' || serviceName === 'MART') ? 'block' : 'none';
    if (carOpts) carOpts.style.display = (serviceName === 'CAR') ? 'block' : 'none';

    if (window.APP.places.origin && window.APP.places.dest) {
        if (window.APP_MAP && window.APP_MAP.drawRoute) window.APP_MAP.drawRoute();
    } else {
        var priceCard = document.getElementById('price-card');
        if (priceCard) priceCard.style.display = 'none';
    }
    window.updateLink();
};

window.updateLink = function () { };

// ─── ORDER SUBMISSION (STRICT FLOW) ─────────────────────────────────────────
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

    // 2. Prepare Payload
    var paymentSelect = document.getElementById('payment-method');
    var paymentMethod = paymentSelect ? paymentSelect.value : 'CASH';

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
        price: window.APP.calc.price
    };

    if (paymentMethod === 'CASH') {
        payload.paymentMethod = 'CASH';
    }
    // Service Extras
    if (window.APP.service === 'FOOD_MART') {
        payload.items = document.getElementById('items').value;
        payload.estPrice = document.getElementById('est-price').value;
    }

    // 3. Strict Branching
    if (paymentMethod === 'QRIS') {
        // A. Show Modal
        var modal = document.getElementById('modal-qris');
        var amountEl = document.getElementById('qris-amount');
        if (modal && amountEl) {
            amountEl.innerText = 'Rp ' + (window.APP.calc.price || 0).toLocaleString('id-ID');
            modal.classList.remove('hidden');
        }

        // B. Bind Click Handler (Closure captures payload)
        var doneBtn = document.getElementById('btn-qris-done');
        if (doneBtn) {
            doneBtn.onclick = function () {
                // Close modal
                if (modal) modal.classList.add('hidden');
                // Send to QRIS endpoint
                window.APP.sendOrderToBackend(payload, '/orders/qris');
            };
        }
        return; // STOP execution here for QRIS
    }

    // IF CASH -> Direct Submit
    window.APP.sendOrderToBackend(payload, '/orders/create');
};

// ─── QRIS HELPERS ───────────────────────────────────────────────────────────
window.closeQrisModal = function () {
    var modal = document.getElementById('modal-qris');
    if (modal) modal.classList.add('hidden');
};

// window.processOrder removed in favor of window.APP.sendOrderToBackend
