/* ========================
   app.js - Strict Payment Flow
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
    activeOrder: null,

    // ─── STARTUP ─────────────────────────────────────────────────────────────
    initApp: function () {
        // Force Hide Modal on Load
        window.closeQrisModal();

        // Tabs
        document.querySelectorAll('.tab').forEach(function (el) {
            el.addEventListener('click', function () {
                window.setService(this.dataset.service, this);
            });
        });

        // Set Default Service
        window.setService('RIDE', document.querySelector('.tab[data-service="RIDE"]'));

        // Mobile Menu Placeholder
        var menuBtn = document.getElementById('menu-btn');
        if (menuBtn) menuBtn.addEventListener('click', function () { alert('Fitur ini belum tersedia.'); });

        // STRICT: Fetch Active Order
        window.APP.fetchActiveOrder();
    },

    // ─── BACKEND SYNC ────────────────────────────────────────────────────────
    fetchActiveOrder: async function () {
        try {
            var token = localStorage.getItem('bj_token');
            if (!token) return;

            var apiUrl = (window.API_URL || 'http://localhost:8080');
            var res = await fetch(apiUrl + '/orders/active', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('bj_token');
                return;
            }

            var data = await res.json();
            if (data && data.activeOrder) {
                var order = data.activeOrder;
                window.APP.activeOrder = order;

                // STRICT RENDER: Only if WAITING_PAYMENT & Amount > 0
                if (order.status === 'WAITING_PAYMENT' && order.payment && order.payment.expected_amount > 0) {
                    window.openQrisModal(order);
                }
            }
        } catch (e) {
            console.error('Fetch active order failed', e);
        }
    },

    // ─── SUBMIT FLOW ─────────────────────────────────────────────────────────
    submitOrder: async function () {
        // 1. Validate inputs
        if (!window.APP.state.pickup.lat || !window.APP.state.dropoff.lat) {
            alert('Lengkapi lokasi dulu ya!');
            return;
        }
        if (!window.APP.calc.price || window.APP.calc.price <= 0) {
            alert('Tunggu estimasi harga...');
            return;
        }

        // 2. Lock UI
        var btn = document.getElementById('btn-submit');
        var originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = '⏳ Memproses...';

        try {
            var paymentSelect = document.getElementById('payment-method');
            var method = paymentSelect ? paymentSelect.value : 'CASH';
            var response = null;

            if (method === 'QRIS') {
                response = await window.APP.createQrisOrder();
            } else {
                response = await window.APP.createCashOrder();
            }

            if (!response) throw new Error('No response');

            // 3. Handle Response
            if (response.status === 'WAITING_PAYMENT' && response.payment && response.payment.expected_amount > 0) {
                // Success QRIS
                window.openQrisModal(response);
            } else if (response.status === 'SEARCHING') {
                // Success CASH
                alert('Order berhasil! ID: ' + (response.orderId || response.order_id));
                window.APP.fetchActiveOrder();
            } else if (response.error) {
                throw new Error(response.error);
            } else {
                // Fallback / Unknown state
                alert('Order status: ' + (response.status || 'Unknown'));
                window.APP.fetchActiveOrder();
            }

        } catch (e) {
            console.error(e);
            alert('Gagal membuat order: ' + e.message);
        } finally {
            // Unlock UI
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        }
    },

    // ─── API HELPERS ─────────────────────────────────────────────────────────
    _buildPayload: function () {
        return {
            service: window.APP.service,
            customer_phone: localStorage.getItem('bj_phone') || '080000000000',
            session_key: localStorage.getItem('bj_token'),
            pickupLocation: window.APP.state.pickup,
            dropoffLocation: window.APP.state.dropoff,
            origin: window.APP.state.pickup.address,
            destination: window.APP.state.dropoff.address,
            note: document.getElementById('note').value,
            price: window.APP.calc.price,
            // Extras for food/mart
            items: document.getElementById('items') ? document.getElementById('items').value : '',
            estPrice: document.getElementById('est-price') ? document.getElementById('est-price').value : ''
        };
    },

    createQrisOrder: async function () {
        var payload = window.APP._buildPayload();
        payload.paymentMethod = 'QRIS';
        return await window.APP._post('/orders/qris', payload);
    },

    createCashOrder: async function () {
        var payload = window.APP._buildPayload();
        payload.paymentMethod = 'CASH';
        return await window.APP._post('/orders/create', payload);
    },

    _post: async function (endpoint, payload) {
        var apiUrl = (window.API_URL || 'http://localhost:8080');
        var token = localStorage.getItem('bj_token');
        var res = await fetch(apiUrl + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        });

        var text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('Server Error: ' + res.status);
        }
    },

    // ─── MODAL CONTROLLERS (STRICT) ──────────────────────────────────────────
    openQrisModal: function (order) {
        // HARD GUARDS
        if (!order) return;
        if (order.status !== 'WAITING_PAYMENT') return;
        if (!order.payment) return;
        if (!order.payment.expected_amount || order.payment.expected_amount <= 0) return;

        var amountEl = document.getElementById('qris-amount');
        var modal = document.getElementById('modal-qris');

        if (amountEl && modal) {
            amountEl.innerText = 'Rp ' + (order.payment.expected_amount).toLocaleString('id-ID');

            modal.classList.remove('hidden');
            modal.style.display = 'flex'; // Explicitly set flex for centering

            // Bind Done Button
            var doneBtn = document.getElementById('btn-qris-done');
            if (doneBtn) {
                doneBtn.onclick = function () {
                    window.closeQrisModal();
                    // Refetch status to see if paid
                    window.APP.fetchActiveOrder();
                    alert('Terima kasih. Kami sedang mengecek pembayaran Anda.');
                };
            }
        }
    },

    closeQrisModal: function () {
        var modal = document.getElementById('modal-qris');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none'; // Force hide
        }
    }
};

// ─── GLOBAL BINDINGS ────────────────────────────────────────────────────────
window.setService = window.APP.setService; // Rebind if needed by HTML
window.updateLink = function () { };
window.submitOrder = function () { window.APP.submitOrder(); };
window.closeQrisModal = function () { window.APP.closeQrisModal(); };
window.openQrisModal = function (o) { window.APP.openQrisModal(o); };
window.finishQrisPayment = function () { }; // Dummy safety

document.addEventListener('DOMContentLoaded', window.APP.initApp);
