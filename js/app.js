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

        // Mobile Menu Placeholder
        var menuBtn = document.getElementById('menu-btn');
        if (menuBtn) menuBtn.addEventListener('click', function () { alert('Fitur ini belum tersedia.'); });

        // Set Default Service
        window.setService('RIDE', document.querySelector('.tab[data-service="RIDE"]') || document.querySelector('.tab'));

        // STRICT: Fetch Active Order on every load
        window.APP.fetchActiveOrder();
    },

    // ─── SERVICE SWITCHER ─────────────────────────────────────────────────────
    setService: function (service, tabEl) {
        window.APP.service = service;

        // Tab highlight
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        if (tabEl) tabEl.classList.add('active');

        // Show/hide jastip fields
        var jastipField = document.getElementById('jastip-field');
        if (jastipField) {
            jastipField.style.display = (service === 'FOOD_MART') ? 'block' : 'none';
        }

        // Show/hide car options
        var carOptions = document.getElementById('car-options');
        if (carOptions) {
            carOptions.style.display = (service === 'CAR') ? 'block' : 'none';
        }

        // Recalculate price if route is already set
        if (window.APP.places && window.APP.places.origin && window.APP.places.dest) {
            if (window.APP_MAP && window.APP_MAP.drawRoute) {
                window.APP_MAP.drawRoute();
            }
        }
    },

    // ─── BACKEND SYNC ────────────────────────────────────────────────────────
    fetchActiveOrder: async function () {
        try {
            var token = localStorage.getItem('bj_token');
            if (!token) return;

            var apiUrl = (window.API_URL || 'http://localhost:3000');
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
                window.APP.renderOrderState(order);
            }
        } catch (e) {
            console.error('Fetch active order failed', e);
        }
    },

    // ─── STATE RENDERER ───────────────────────────────────────────────────────
    // Single function that decides what to show based on order status.
    // Frontend NEVER guesses state — this is always driven by backend response.
    renderOrderState: function (order) {
        if (!order || !order.status) return;

        var status = order.status;

        if (status === 'WAITING_PAYMENT') {
            // Guard: only show QRIS if amount is confirmed
            if (order.payment && order.payment.expected_amount > 0) {
                window.openQrisModal(order);
            }
            return;
        }

        if (['SEARCHING', 'ACCEPTED', 'PICKING_UP', 'ARRIVED', 'ON_RIDE', 'BUYING', 'DELIVERING'].includes(status)) {
            window.APP.showStatusCard(order);
            return;
        }

        if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status)) {
            // Order is done — clear active state, show form
            window.APP.activeOrder = null;
            window.APP.hideStatusCard();
            return;
        }
    },

    // ─── STATUS CARD ─────────────────────────────────────────────────────────
    showStatusCard: function (order) {
        var card = document.getElementById('active-order-card');
        var statusText = document.getElementById('order-status-text');
        var orderIdText = document.getElementById('order-id-text');

        if (!card) return;

        var statusMessages = {
            'SEARCHING': '🔍 Mencari driver terdekat...',
            'ACCEPTED': '✅ Driver ditemukan! Sedang menuju lokasi jemput.',
            'PICKING_UP': '🛵 Driver dalam perjalanan ke lokasi jemput.',
            'ARRIVED': '📍 Driver sudah tiba! Segera keluar ya.',
            'ON_RIDE': '🚀 Perjalanan sedang berlangsung.',
            'BUYING': '🛒 Driver sedang berbelanja.',
            'DELIVERING': '📦 Driver sedang mengantar.'
        };

        if (statusText) {
            statusText.innerText = statusMessages[order.status] || ('Status: ' + order.status);
        }
        if (orderIdText) {
            var id = order.orderId || order.order_id || '';
            orderIdText.innerText = id ? ('ID Order: ' + id.substring(0, 8).toUpperCase()) : '';
        }

        // Hide the form, show the status card
        var cardInterface = document.querySelector('.card-interface');
        if (cardInterface) cardInterface.style.display = 'none';

        var bottomBar = document.querySelector('.bottom-bar');
        if (bottomBar) bottomBar.style.display = 'none';

        card.style.display = 'flex';
    },

    hideStatusCard: function () {
        var card = document.getElementById('active-order-card');
        if (card) card.style.display = 'none';

        var cardInterface = document.querySelector('.card-interface');
        if (cardInterface) cardInterface.style.display = '';

        var bottomBar = document.querySelector('.bottom-bar');
        if (bottomBar) bottomBar.style.display = '';
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
        var originalText = btn ? btn.innerText : '';
        if (btn) { btn.disabled = true; btn.innerText = '⏳ Memproses...'; }

        try {
            var paymentSelect = document.getElementById('payment-method');
            var method = paymentSelect ? paymentSelect.value : 'CASH';
            var response = null;

            if (method === 'QRIS') {
                response = await window.APP.createQrisOrder();
            } else {
                response = await window.APP.createCashOrder();
            }

            if (!response) throw new Error('No response from server');

            if (response.error) throw new Error(response.error);

            // 3. Handle Response — always use renderOrderState
            if (response.status === 'WAITING_PAYMENT' && response.payment && response.payment.expected_amount > 0) {
                window.APP.activeOrder = response;
                window.openQrisModal(response);
            } else if (response.status === 'SEARCHING') {
                window.APP.activeOrder = response;
                window.APP.showStatusCard(response);
            } else {
                // Unknown state — refetch from backend to get authoritative state
                await window.APP.fetchActiveOrder();
            }

        } catch (e) {
            console.error(e);
            alert('Gagal membuat order: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
        }
    },

    // ─── PRICING PREVIEW ─────────────────────────────────────────────────────
    // Called by map.js after route is calculated. Returns backend-authoritative price.
    fetchPricePreview: async function (pickupLocation, dropoffLocation, distanceKm) {
        try {
            var apiUrl = (window.API_URL || 'http://localhost:3000');
            var res = await fetch(apiUrl + '/pricing/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service: window.APP.service,
                    pickupLocation: pickupLocation,
                    dropoffLocation: dropoffLocation
                })
            });

            if (!res.ok) throw new Error('Preview failed: ' + res.status);
            var data = await res.json();

            if (data && data.success && data.price > 0) {
                window.APP.calc.price = data.price;
                window.APP.calc.distance = data.distanceKm || distanceKm || 0;

                // Update UI
                var fakePrice = Math.ceil((data.price * 1.10) / 500) * 500;
                var priceDisplay = document.getElementById('price-display');
                var fakeDisplay = document.getElementById('fake-price');
                var distDisplay = document.getElementById('dist-display');
                var priceCard = document.getElementById('price-card');

                if (priceDisplay) priceDisplay.innerText = 'Rp ' + data.price.toLocaleString('id-ID');
                if (fakeDisplay) fakeDisplay.innerText = 'Rp ' + fakePrice.toLocaleString('id-ID');
                if (distDisplay) distDisplay.innerText = (data.distanceKm || distanceKm || 0).toFixed(1) + ' km';
                if (priceCard) priceCard.style.display = 'flex';

                // Update submit button
                window.APP.updateSubmitButton();
                return data.price;
            }
        } catch (e) {
            console.warn('[PRICING] Backend preview failed, using local fallback:', e.message);
        }
        return null;
    },

    updateSubmitButton: function () {
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        if (!btn || !btnText) return;

        if (window.APP.calc.price > 0 && window.APP.state.pickup.lat && window.APP.state.dropoff.lat) {
            btn.classList.remove('disabled');
            btnText.innerText = 'Pesan Sekarang →';
        } else {
            btn.classList.add('disabled');
            btnText.innerText = 'Isi Lokasi Dulu';
        }
    },

    // ─── API HELPERS ─────────────────────────────────────────────────────────
    _buildPayload: function () {
        return {
            service: window.APP.service,
            customer_phone: localStorage.getItem('bj_phone') || '',
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
            note: document.getElementById('note') ? document.getElementById('note').value : '',
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
        var apiUrl = (window.API_URL || 'http://localhost:3000');
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
        // HARD GUARDS — QRIS modal NEVER auto-appears
        if (!order) return;
        if (order.status !== 'WAITING_PAYMENT') return;
        if (!order.payment) return;
        if (!order.payment.expected_amount || order.payment.expected_amount <= 0) return;

        var amountEl = document.getElementById('qris-amount');
        var modal = document.getElementById('modal-qris');

        if (amountEl && modal) {
            amountEl.innerText = 'Rp ' + (order.payment.expected_amount).toLocaleString('id-ID');
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            // Done button handled by global finishQrisPayment binding
        }
    },

    closeQrisModal: function () {
        var modal = document.getElementById('modal-qris');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    }
};

// ─── GLOBAL BINDINGS ────────────────────────────────────────────────────────
window.setService = function (service, tabEl) { window.APP.setService(service, tabEl); };
window.updateLink = function () { window.APP.updateSubmitButton(); };
window.submitOrder = function () { window.APP.submitOrder(); };
window.closeQrisModal = function () { window.APP.closeQrisModal(); };
window.openQrisModal = function (o) { window.APP.openQrisModal(o); };
window.finishQrisPayment = function () {
    window.closeQrisModal();
    window.APP.fetchActiveOrder();
    alert('Terima kasih. Kami sedang mengecek pembayaran Anda.');
};

document.addEventListener('DOMContentLoaded', window.APP.initApp);
