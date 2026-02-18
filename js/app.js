/* ========================
   app.js - Strict Payment Flow
   Backend is the ONLY pricing authority.
   ======================== */

// ─── TOAST SYSTEM ────────────────────────────────────────────────────────────
window.showToast = function (msg, duration) {
    var existing = document.getElementById('bj-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'bj-toast';
    toast.innerText = msg;
    toast.style.cssText = [
        'position:fixed', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.85)', 'color:#fff', 'padding:12px 20px',
        'border-radius:24px', 'font-size:14px', 'font-weight:500',
        'z-index:99999', 'pointer-events:none', 'white-space:nowrap',
        'box-shadow:0 4px 16px rgba(0,0,0,0.3)', 'transition:opacity 0.3s'
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, duration || 3000);
};

window.APP = {
    service: 'RIDE',
    uiState: 'IDLE', // IDLE | ROUTE_READY | PRICING_LOADING | PRICED | SUBMITTING | WAITING_PAYMENT | ACTIVE
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
    _qrisCountdownTimer: null,

    // ─── STARTUP ─────────────────────────────────────────────────────────────
    initApp: function () {
        // Force Hide Modal on Load
        window.closeQrisModal();

        // Mobile Menu Placeholder
        var menuBtn = document.getElementById('menu-btn');
        if (menuBtn) menuBtn.addEventListener('click', function () {
            if (window.showToast) window.showToast('Fitur ini belum tersedia.');
        });

        // Set Default Service
        window.setService('RIDE', document.querySelector('.tab[data-service="RIDE"]') || document.querySelector('.tab'));

        // STRICT: Fetch Active Order on every load — recovers UI into ACTIVE state if needed
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

        // Fetch pricing config for this service (for UI hints only)
        window.APP.fetchPricingConfig(service);

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
                localStorage.removeItem('bj_phone');
                if (window.APP_AUTH && window.APP_AUTH.showLogin) window.APP_AUTH.showLogin();
                return;
            }

            var data = await res.json();
            if (data && data.activeOrder) {
                var order = data.activeOrder;
                window.APP.activeOrder = order;
                window.APP.renderOrderState(order);
            } else {
                // ✅ Explicit null path: no active order → unlock form
                window.APP.activeOrder = null;
                window.APP.hideStatusCard();
                window.APP.unlockForm();
                window.APP.updateSubmitButton();
            }
        } catch (e) {
            console.error('Fetch active order failed', e);
            // Network error: do NOT unlock — preserve current state
        }
    },

    // ─── PRICING CONFIG (UI HINTS ONLY) ──────────────────────────────────────
    // Fetches GET /pricing/config once per service switch. Cached in memory.
    // NEVER used for final price math — only for UI labels, distance limits.
    _pricingConfigCache: {},
    fetchPricingConfig: async function (service) {
        if (!service) service = window.APP.service;
        if (window.APP._pricingConfigCache[service]) return; // already cached

        try {
            var apiUrl = (window.API_URL || 'http://localhost:3000');
            var res = await fetch(apiUrl + '/pricing/config');
            if (!res.ok) throw new Error('Config fetch failed: ' + res.status);
            var data = await res.json();

            // Backend returns { success: true, data: { RIDE: {...}, SEND: {...}, ... } }
            var configs = (data.success && data.data) ? data.data : data;
            if (configs && typeof configs === 'object') {
                // Cache all services at once
                Object.keys(configs).forEach(function (svc) {
                    window.APP._pricingConfigCache[svc] = configs[svc];
                });
                console.log('[PRICING CONFIG] Loaded from backend:', Object.keys(configs));
            }
        } catch (e) {
            console.warn('[PRICING CONFIG] Failed to load, UI hints will use fallback.', e.message);
        }
    },

    // Returns the backend config for a service (for UI hints only)
    getPricingConfig: function (service) {
        return window.APP._pricingConfigCache[service || window.APP.service] || null;
    },

    // ─── STATE RENDERER ───────────────────────────────────────────────────────
    // Single function that decides what to show based on order status.
    // Frontend NEVER guesses state — this is always driven by backend response.
    renderOrderState: function (order) {
        if (!order || !order.status) return;

        var status = order.status;

        if (status === 'WAITING_PAYMENT') {
            window.APP.uiState = 'WAITING_PAYMENT';
            window.APP.lockFormForActiveOrder();
            // Guard: only show QRIS if amount is confirmed
            if (order.payment && order.payment.expected_amount > 0) {
                window.openQrisModal(order);
            }
            return;
        }

        if (['SEARCHING', 'ACCEPTED', 'PICKING_UP', 'ARRIVED', 'ON_RIDE', 'BUYING', 'DELIVERING'].includes(status)) {
            window.APP.uiState = 'ACTIVE';
            window.APP.showStatusCard(order);
            return;
        }

        if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status)) {
            // Order is done — clear active state, unlock form
            window.APP.activeOrder = null;
            window.APP.uiState = 'IDLE';
            window.APP.hideStatusCard();
            window.APP.unlockForm();
            window.APP.updateSubmitButton();
            return;
        }
    },

    // ─── FORM LOCK / UNLOCK ──────────────────────────────────────────────────
    // Disables all form inputs while an active order exists.
    lockFormForActiveOrder: function () {
        var inputs = document.querySelectorAll('#view-main input, #view-main select, #view-main textarea');
        inputs.forEach(function (el) { el.disabled = true; });
        window.APP.updateSubmitButton();
    },

    unlockForm: function () {
        var inputs = document.querySelectorAll('#view-main input, #view-main select, #view-main textarea');
        inputs.forEach(function (el) { el.disabled = false; });
    },

    // ─── STATUS CARD ─────────────────────────────────────────────────────────
    showStatusCard: function (order) {
        var card = document.getElementById('active-order-card');
        var statusText = document.getElementById('order-status-text');
        var orderIdText = document.getElementById('order-id-text');
        var cancelBtn = document.getElementById('order-cancel-btn');

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

        // Show cancel button only for cancellable statuses
        var cancellableStatuses = ['SEARCHING', 'ACCEPTED', 'PICKING_UP', 'ARRIVED'];
        if (cancelBtn) {
            cancelBtn.style.display = cancellableStatuses.includes(order.status) ? 'block' : 'none';
        }

        // Lock form inputs while order is active
        window.APP.lockFormForActiveOrder();

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

    // ─── CUSTOMER CANCEL ─────────────────────────────────────────────────────
    cancelActiveOrder: async function () {
        var order = window.APP.activeOrder;
        if (!order) return;
        var orderId = order.orderId || order.order_id || order.id;
        if (!orderId) { if (window.showToast) window.showToast('ID order tidak ditemukan'); return; }

        var cancelBtn = document.getElementById('order-cancel-btn');
        if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.innerText = '⏳ Membatalkan...'; }

        try {
            var token = localStorage.getItem('bj_token');
            var apiUrl = (window.API_URL || 'http://localhost:3000');
            var res = await fetch(apiUrl + '/orders/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({
                    orderId: orderId,
                    customer_id: window.APP._getCustomerId(),
                    customer_phone: localStorage.getItem('bj_phone') || '',
                    reason: 'Customer cancel'
                })
            });
            var data = await res.json();
            if (data && (data.success || data.idempotent)) {
                if (window.showToast) window.showToast('Order dibatalkan.');
            } else {
                if (window.showToast) window.showToast(data.message || 'Gagal membatalkan order');
            }
        } catch (e) {
            if (window.showToast) window.showToast('Gagal membatalkan: ' + e.message);
        } finally {
            // Always re-sync with backend
            await window.APP.fetchActiveOrder();
            if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.innerText = 'Batalkan Order'; }
        }
    },

    _getCustomerId: function () {
        // Try to extract customer_id from JWT payload (base64 decode middle segment)
        try {
            var token = localStorage.getItem('bj_token');
            if (!token) return null;
            var payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id || payload.sub || payload.customer_id || null;
        } catch (e) { return null; }
    },

    // ─── SECTION 6: SUBMIT FLOW ──────────────────────────────────────────────
    submitOrder: async function () {
        // 1. Gate checks
        if (!window.APP.state.pickup.lat || !window.APP.state.dropoff.lat) {
            if (window.showToast) window.showToast('Lengkapi lokasi dulu ya!');
            return;
        }
        if (!window.APP.calc.price || window.APP.calc.price <= 0) {
            if (window.showToast) window.showToast('Tunggu harga dari server dulu...');
            return;
        }
        if (window.APP.calc.withinLimit === false) {
            if (window.showToast) window.showToast('Jarak melebihi batas layanan');
            return;
        }

        // 2. Lock UI
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        if (btn) btn.classList.add('disabled');
        if (btnText) btnText.innerText = '⏳ Memproses...';

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
            if (!response.success && response.message) throw new Error(response.message);

            // 3. Always fetch authoritative state from backend — no local guessing
            await window.APP.fetchActiveOrder();

        } catch (e) {
            console.error('[ORDER] Submit failed:', e);
            if (window.showToast) window.showToast('Gagal membuat order: ' + e.message);
        } finally {
            // Restore button state via updateSubmitButton
            window.APP.updateSubmitButton();
        }
    },

    // ─── SECTION 1: PRICING PREVIEW ─────────────────────────────────────────
    // Called by map.js after route is calculated. Returns backend-authoritative price.
    // This is the ONLY function allowed to set APP.calc.price to a positive value.
    fetchPricePreview: async function (pickupLocation, dropoffLocation, distanceKm) {
        // Show loading state
        var priceDisplay = document.getElementById('price-display');
        var priceCard = document.getElementById('price-card');
        if (priceDisplay) priceDisplay.innerText = '⏳ Menghitung harga...';
        if (priceCard) priceCard.style.display = 'flex';

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

            // Handle specific backend errors
            if (res.status === 422) {
                var errData = await res.json().catch(function () { return {}; });
                var msg = (errData && errData.message) || 'Layanan tidak tersedia untuk rute ini';
                if (window.showToast) window.showToast(msg);
                window.APP.calc.price = 0;
                if (priceCard) priceCard.style.display = 'none';
                window.APP.updateSubmitButton();
                return null;
            }

            if (!res.ok) throw new Error('Preview failed: ' + res.status);
            var data = await res.json();

            if (data && data.success && data.price > 0) {
                // ✅ ONLY place APP.calc.price is set to a positive value
                window.APP.calc.price = data.price;
                window.APP.calc.distance = data.distanceKm || distanceKm || 0;

                // ─── DISTANCE DEBUG TABLE (instrumentation only) ──────────────
                var backendKm = data.distanceKm || 0;
                var dbg = window.APP._distanceDebug || {};
                console.table({
                    frontend_raw_meters: dbg.rawMeters !== undefined ? dbg.rawMeters : 'N/A',
                    frontend_km: dbg.frontendKm !== undefined ? parseFloat(dbg.frontendKm.toFixed(3)) : 'N/A',
                    backend_distance_km: backendKm,
                    difference_percent: dbg.frontendKm
                        ? (((backendKm - dbg.frontendKm) / dbg.frontendKm) * 100).toFixed(2) + '%'
                        : 'N/A'
                });
                // ─────────────────────────────────────────────────────────────

                // Update UI with confirmed backend price
                var fakePrice = Math.ceil((data.price * 1.10) / 500) * 500;
                var fakeDisplay = document.getElementById('fake-price');
                var distDisplay = document.getElementById('dist-display');

                if (priceDisplay) priceDisplay.innerText = 'Rp ' + data.price.toLocaleString('id-ID');
                if (fakeDisplay) fakeDisplay.innerText = 'Rp ' + fakePrice.toLocaleString('id-ID');
                if (distDisplay) distDisplay.innerText = (data.distanceKm || distanceKm || 0).toFixed(1) + ' km';
                if (priceCard) priceCard.style.display = 'flex';

                window.APP.updateSubmitButton();
                return data.price;
            }

            throw new Error('Backend returned no valid price');
        } catch (e) {
            console.warn('[PRICING] Backend preview failed:', e.message);
            window.APP.calc.price = 0;
            if (priceCard) priceCard.style.display = 'none';
            window.APP.updateSubmitButton();
        }
        return null;
    },

    // ─── SECTION 7: SUBMIT BUTTON GATE ──────────────────────────────────────
    // Enabled ONLY when: no active order + pickup + dropoff + backend price + within limit
    updateSubmitButton: function () {
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        if (!btn || !btnText) return;

        var hasActiveOrder = !!window.APP.activeOrder;
        var hasPickup = !!(window.APP.state.pickup && window.APP.state.pickup.lat);
        var hasDropoff = !!(window.APP.state.dropoff && window.APP.state.dropoff.lat);
        var hasPrice = window.APP.calc.price > 0;
        var withinLimit = window.APP.calc.withinLimit !== false; // default true if not set
        var isPricingLoading = window.APP.uiState === 'PRICING_LOADING';

        if (hasActiveOrder) {
            btn.classList.add('disabled');
            btnText.innerText = 'Order Aktif';
        } else if (!hasPickup || !hasDropoff) {
            btn.classList.add('disabled');
            btnText.innerText = 'Isi Lokasi Dulu';
        } else if (!withinLimit) {
            btn.classList.add('disabled');
            btnText.innerText = 'Jarak Terlalu Jauh';
        } else if (isPricingLoading) {
            btn.classList.add('disabled');
            btnText.innerText = 'Menghitung Harga...';
        } else if (!hasPrice) {
            btn.classList.add('disabled');
            btnText.innerText = 'Menunggu Harga...';
        } else {
            btn.classList.remove('disabled');
            btnText.innerText = 'Pesan Sekarang →';
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
        var countdownEl = document.getElementById('qris-countdown');

        if (amountEl && modal) {
            amountEl.innerText = 'Rp ' + (order.payment.expected_amount).toLocaleString('id-ID');
            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            // Start 15-minute countdown
            window.APP._startQrisCountdown(15 * 60, countdownEl);
        }
    },

    _startQrisCountdown: function (totalSeconds, el) {
        // Clear any existing timer
        if (window.APP._qrisCountdownTimer) clearInterval(window.APP._qrisCountdownTimer);
        var remaining = totalSeconds;

        function format(s) {
            var m = Math.floor(s / 60);
            var sec = s % 60;
            return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        if (el) el.innerText = format(remaining);

        window.APP._qrisCountdownTimer = setInterval(function () {
            remaining--;
            if (el) el.innerText = format(remaining);
            if (remaining <= 0) {
                clearInterval(window.APP._qrisCountdownTimer);
                window.APP._qrisCountdownTimer = null;
                if (el) el.innerText = 'EXPIRED';
                // Sync with backend — payment may have timed out
                window.APP.fetchActiveOrder();
            }
        }, 1000);
    },

    closeQrisModal: function () {
        var modal = document.getElementById('modal-qris');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        // Clear countdown timer
        if (window.APP._qrisCountdownTimer) {
            clearInterval(window.APP._qrisCountdownTimer);
            window.APP._qrisCountdownTimer = null;
        }
    },

    cancelQrisPayment: function () {
        // 1. Cancel the active order (unlocks form)
        window.APP.cancelActiveOrder();
        // 2. Hide the modal instantly
        window.APP.closeQrisModal();
    }
};

// ─── GLOBAL BINDINGS ────────────────────────────────────────────────────────
window.setService = function (service, tabEl) { window.APP.setService(service, tabEl); };
window.updateLink = function () { window.APP.updateSubmitButton(); };
window.submitOrder = function () { window.APP.submitOrder(); };
window.closeQrisModal = function () { window.APP.closeQrisModal(); };
window.openQrisModal = function (o) { window.APP.openQrisModal(o); };
window.cancelActiveOrder = function () { window.APP.cancelActiveOrder(); };
window.cancelQrisPayment = function () { window.APP.cancelQrisPayment(); };
window.finishQrisPayment = async function () {
    if (window.showToast) window.showToast('⏳ Mengecek pembayaran...');
    // Do NOT close modal yet — wait for backend confirmation
    await window.APP.fetchActiveOrder();
    // If still WAITING_PAYMENT, reopen modal
    var order = window.APP.activeOrder;
    if (order && order.status === 'WAITING_PAYMENT') {
        if (window.showToast) window.showToast('Pembayaran belum terkonfirmasi. Coba lagi.');
        window.APP.openQrisModal(order);
    } else {
        window.APP.closeQrisModal();
    }
};

document.addEventListener('DOMContentLoaded', window.APP.initApp);
