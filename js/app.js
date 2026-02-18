/* ========================
   app.js - The Brains (Strict Backend-Driven)
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
    activeOrder: null, // New: Store active order from backend

    // ─── STARTUP ─────────────────────────────────────────────────────────────
    initApp: function () {
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

        // STRICT: Fetch Active Order on Load
        window.APP.fetchActiveOrder();
    },

    // ─── BACKEND SYNC ────────────────────────────────────────────────────────
    fetchActiveOrder: async function () {
        try {
            var token = localStorage.getItem('bj_token');
            if (!token) return; // No session, stay on main form

            var apiUrl = (window.API_URL || 'http://localhost:8080');
            var res = await fetch(apiUrl + '/orders/active', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.status === 401 || res.status === 403) {
                // Token invalid/expired -> clear and stay on main
                localStorage.removeItem('bj_token');
                return;
            }

            var data = await res.json();
            if (data && data.activeOrder) {
                window.APP.activeOrder = data.activeOrder;
                window.APP.renderState(data.activeOrder);
            }
        } catch (e) {
            console.error('Failed to fetch active order:', e);
            // On error, we default to main form (safe fallback)
        }
    },

    // ─── STATE RENDERER (CORE TRUTH) ─────────────────────────────────────────
    renderState: function (order) {
        if (!order) {
            window.closeQrisModal();
            return;
        }

        // 1. QRIS STATE
        if (order.status === 'WAITING_PAYMENT' && order.payment && order.payment.expected_amount > 0) {
            window.showQrisModal(order);
        } else {
            window.closeQrisModal();
        }

        // 2. SEARCHING STATE (Optional tracking UI)
        if (order.status === 'SEARCHING') {
            // Can show a toast or sticky footer
            var btn = document.getElementById('btn-submit');
            if (btn) {
                btn.innerText = 'Mencari Driver...';
                btn.classList.add('disabled');
            }
        }
    },

    // ─── API SEND HELPER ─────────────────────────────────────────────────────
    sendOrderToBackend: function (payload, endpoint) {
        if (window.isSubmitting) return;
        window.isSubmitting = true;

        var btn = document.getElementById('btn-submit');
        var originalText = btn ? btn.innerText : '';
        if (btn) {
            btn.innerText = '⏳ Memproses...';
            btn.disabled = true;
        }

        var apiUrl = (window.API_URL || 'http://localhost:8080');
        var token = localStorage.getItem('bj_token');

        fetch(apiUrl + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        })
            .then(async function (res) {
                if (!res.ok) {
                    var text = await res.text();
                    try { return JSON.parse(text); } catch (e) { throw new Error('Server Error: ' + res.status); }
                }
                return res.json();
            })
            .then(function (data) {
                window.isSubmitting = false;
                if (btn) {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }

                if (data.activeOrder) {
                    // Backend returned updated state directly?
                    window.APP.activeOrder = data.activeOrder;
                    window.APP.renderState(data.activeOrder);
                } else if (data.orderId || data.order_id) {
                    // Standard create response
                    // Construct a temporary order object for immediate rendering if needed
                    // But better to fetch active or trust the response structure
                    // Assuming qris creates WAITING_PAYMENT
                    var newOrder = {
                        status: endpoint.includes('qris') ? 'WAITING_PAYMENT' : 'SEARCHING',
                        payment: {
                            expected_amount: data.expected_amount || data.payment?.expected_amount || 0
                        },
                        orderId: data.orderId || data.order_id
                    };
                    window.APP.renderState(newOrder);

                    if (endpoint.includes('create')) {
                        alert('Order berhasil dibuat! ID: ' + newOrder.orderId);
                    }
                } else if (data.success && endpoint.includes('qris')) {
                    // Fallback if structure varies
                    // Refetch to be sure
                    window.APP.fetchActiveOrder();
                } else {
                    alert('Gagal: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(function (error) {
                window.isSubmitting = false;
                if (btn) {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
                console.error('Submit Error:', error);
                alert('Terjadi kesalahan koneksi.');
            });
    }
};

// ─── TOP LEVEL FUNCTIONS ────────────────────────────────────────────────────
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
    }
    window.updateLink();
};

window.updateLink = function () { };

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
        pickupLocation: window.APP.state.pickup,
        dropoffLocation: window.APP.state.dropoff,
        origin: window.APP.state.pickup.address,
        destination: window.APP.state.dropoff.address,
        note: document.getElementById('note').value,
        price: window.APP.calc.price,
        paymentMethod: paymentMethod
    };

    if (window.APP.service === 'FOOD_MART') {
        payload.items = document.getElementById('items').value;
        payload.estPrice = document.getElementById('est-price').value;
    }

    // 3. Strict Branching
    if (paymentMethod === 'QRIS') {
        window.APP.sendOrderToBackend(payload, '/orders/qris');
    } else {
        window.APP.sendOrderToBackend(payload, '/orders/create');
    }
};

// ─── QRIS MODAL CONTROL ─────────────────────────────────────────────────────
window.showQrisModal = function (order) {
    // DEFENSIVE: Double check amount
    var amount = order.payment ? order.payment.expected_amount : 0;
    if (amount <= 0) {
        console.error('Invalid QRIS state: Amount is 0');
        return;
    }

    var modal = document.getElementById('modal-qris');
    var amountEl = document.getElementById('qris-amount');

    if (modal && amountEl) {
        amountEl.innerText = 'Rp ' + amount.toLocaleString('id-ID');
        modal.classList.remove('hidden');

        // Bind Confirm Button
        var doneBtn = document.getElementById('btn-qris-done');
        if (doneBtn) {
            doneBtn.onclick = function () {
                // User says they paid.
                // We could call a verification endpoint, but for MVP just hide or refetch?
                // User request implies: "User klik... Backend create... Backend return... -> Show QR"
                // It doesn't say what happens AFTER "Sudah Bayar".
                // I will strictly just hide the modal and maybe trigger a status check.
                modal.classList.add('hidden');
                alert('Terima kasih! Kami akan mengecek pembayaran Anda.');
                window.APP.fetchActiveOrder(); // Refresh state
            };
        }
    }
};

window.closeQrisModal = function () {
    var modal = document.getElementById('modal-qris');
    if (modal) modal.classList.add('hidden');
};

// Global Safety
window.finishQrisPayment = function () { /* No-op, handled by showQrisModal binding */ };

// Init
document.addEventListener('DOMContentLoaded', window.APP.initApp);
