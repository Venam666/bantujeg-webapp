/* ========================
   app.js - Strict Payment Flow
   Backend is the ONLY pricing authority.
   Refactor: initApp() no longer calls setService(). setService() guards on _mapReady.
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
    uiState: 'IDLE',
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
    _isFetchingOrder: false,
    _pollingTimer: null,
    _pollingInterval: 5000,

    // ─── STARTUP ─────────────────────────────────────────────────────────────
    // initApp runs on DOMContentLoaded — before the Google Maps SDK has loaded.
    // It must NOT call setService() or trigger any map/route operations.
    // setService('RIDE') is called exactly once, inside initMap() in map.js,
    // after the map, ds, and dr are fully constructed.
    initApp: function () {
        window.closeQrisModal();

        var menuBtn = document.getElementById('menu-btn');
        if (menuBtn) menuBtn.addEventListener('click', function () {
            if (window.showToast) window.showToast('Fitur ini belum tersedia.');
        });

        // Recover UI into ACTIVE state if there is an existing order.
        window.APP.fetchActiveOrder();

        // Native UI: Backdrop click closes modals
        var backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function () {
                window.APP.closeConfirmModal();
                window.APP.closeQrisModal();
                // Do NOT close active order card (it's persistent)
            });
        }
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
            carOptions.style.display = (service === 'CAR' || service === 'CAR_XL') ? 'block' : 'none';
        }

        // Default seat selection per service
        if (service === 'CAR_XL') {
            var sixSeatRadio = document.querySelector('input[name="car-seat"][value="6"]');
            if (sixSeatRadio) { sixSeatRadio.checked = true; window.APP.carOptions.seats = 6; }
        } else if (service === 'CAR') {
            window.APP.service = 'CAR';
            window.APP.carOptions.seats = 4;
            var fourSeatRadio = document.querySelector('input[name="car-seat"][value="4"]');
            if (fourSeatRadio) { fourSeatRadio.checked = true; }
        }

        // Reset pricing display immediately — stale price from previous service must not show
        window.APP.calc = { distance: 0, price: 0, duration: 0, withinLimit: true };
        var _priceCard = document.getElementById('price-card');
        var _errorCard = document.getElementById('error-card');
        var _distDisplay = document.getElementById('dist-display');
        if (_priceCard) _priceCard.style.display = 'none';
        if (_errorCard) _errorCard.style.display = 'none';
        if (_distDisplay) _distDisplay.innerText = '0 km';
        window.APP.updateSubmitButton();

        // Fetch pricing config for the new service (background, non-blocking)
        window.APP.fetchPricingConfig(service);

        // ── ROUTE TRIGGER GUARD ───────────────────────────────────────────────
        // Only trigger a route draw if:
        //   1. The map is fully initialized (_mapReady is true), AND
        //   2. Both origin and destination are confirmed.
        // This prevents setService() — called on DOMContentLoaded via initApp()
        // in the old architecture — from racing with the async Maps SDK load.
        // Now initApp() does NOT call setService(), so this guard is belt-and-suspenders.
        if (window._mapReady &&
            window.APP.places && window.APP.places.origin && window.APP.places.dest &&
            window.triggerRoute) {
            window.triggerRoute();
        }
        // ─────────────────────────────────────────────────────────────────────
    },

    // ─── BACKEND SYNC ────────────────────────────────────────────────────────
    fetchActiveOrder: async function () {
        if (window.APP._isFetchingOrder) return;
        window.APP._isFetchingOrder = true;
        try {
            var res = await fetch((window.API_URL || 'http://localhost:3000') + '/orders/active', {
                headers: window.APP_AUTH.getAuthHeaders()
            });

            if (res.status === 401 || res.status === 403) {
                console.warn('[ORDERS] 401 on /orders/active. Session expired — stopping polling.');
                localStorage.removeItem('bj_token');
                window.APP.stopPolling();
                return;
            }

            var data = await res.json();
            if (data && data.activeOrder) {
                var order = data.activeOrder;
                window.APP.activeOrder = order;
                window.APP.renderOrderState(order);
            } else {
                window.APP.activeOrder = null;
                window.APP.hideStatusCard();
                window.APP.unlockForm();
                window.APP.updateSubmitButton();
            }
        } catch (e) {
            console.error('Fetch active order failed', e);
        } finally {
            window.APP._isFetchingOrder = false;
        }
    },

    // ─── PRICING CONFIG (UI HINTS ONLY) ──────────────────────────────────────
    _pricingConfigCache: {},
    _pricingConfigCacheTime: {},
    fetchPricingConfig: async function (service) {
        if (!service) service = window.APP.service;
        var _CACHE_TTL = 5 * 60 * 1000;
        var _cachedAt = window.APP._pricingConfigCacheTime[service] || 0;
        var _isFresh = window.APP._pricingConfigCache[service] && (Date.now() - _cachedAt) < _CACHE_TTL;
        if (_isFresh) return;

        try {
            var apiUrl = (window.API_URL || 'http://localhost:3000');
            var res = await fetch(apiUrl + '/pricing/config');
            if (!res.ok) throw new Error('Config fetch failed: ' + res.status);
            var data = await res.json();

            var configs = (data.success && data.data) ? data.data : data;
            if (configs && typeof configs === 'object') {
                Object.keys(configs).forEach(function (svc) {
                    window.APP._pricingConfigCache[svc] = configs[svc];
                    window.APP._pricingConfigCacheTime[svc] = Date.now();
                });
                console.log('[PRICING CONFIG] Loaded:', Object.keys(configs));
            }
        } catch (e) {
            console.warn('[PRICING CONFIG] Failed to load, UI hints will use fallback.', e.message);
        }
    },

    getPricingConfig: function (service) {
        return window.APP._pricingConfigCache[service || window.APP.service] || null;
    },

    // ─── STATE RENDERER ───────────────────────────────────────────────────────
    renderOrderState: function (order) {
        if (!order || !order.status) return;

        var status = order.status;

        if (status === 'WAITING_PAYMENT') {
            window.APP.uiState = 'WAITING_PAYMENT';
            window.APP.lockFormForActiveOrder();
            window.APP.startPolling();
            if (order.payment && order.payment.expected_amount > 0) {
                window.openQrisModal(order);
            }
            return;
        }

        if (['SEARCHING', 'ACCEPTED', 'PICKING_UP', 'ARRIVED', 'ON_RIDE', 'BUYING', 'DELIVERING'].includes(status)) {
            window.APP.uiState = 'ACTIVE';
            window.APP.showStatusCard(order);
            window.APP.startPolling();
            return;
        }

        if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status)) {
            window.APP.activeOrder = null;
            window.APP.uiState = 'IDLE';
            window.APP.stopPolling();
            window.APP.hideStatusCard();
            window.APP.unlockForm();
            window.APP.updateSubmitButton();
            return;
        }
    },

    // ─── POLLING ─────────────────────────────────────────────────────────────
    startPolling: function () {
        window.APP.stopPolling();
        window.APP._pollingTimer = setInterval(async function () {
            if (!window.APP.activeOrder) { window.APP.stopPolling(); return; }
            if (document.hidden) return;
            await window.APP.fetchActiveOrder();
        }, window.APP._pollingInterval);
    },

    stopPolling: function () {
        if (window.APP._pollingTimer) {
            clearInterval(window.APP._pollingTimer);
            window.APP._pollingTimer = null;
        }
    },

    // ─── FORM LOCK / UNLOCK ──────────────────────────────────────────────────
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

        if (statusText) statusText.innerText = statusMessages[order.status] || ('Status: ' + order.status);
        if (orderIdText) {
            var id = order.orderId || order.order_id || '';
            orderIdText.innerText = id ? ('ID Order: ' + id.substring(0, 8).toUpperCase()) : '';
        }

        var cancellableStatuses = ['SEARCHING', 'ACCEPTED', 'PICKING_UP', 'ARRIVED'];
        if (cancelBtn) cancelBtn.style.display = cancellableStatuses.includes(order.status) ? 'block' : 'none';

        window.APP.lockFormForActiveOrder();

        var cardInterface = document.querySelector('.card-interface');
        if (cardInterface) cardInterface.style.display = 'none';

        var bottomBar = document.querySelector('.bottom-bar');
        if (bottomBar) bottomBar.style.display = 'none';

        // Native Transition: Slide up
        card.classList.add('active');
    },

    hideStatusCard: function () {
        var card = document.getElementById('active-order-card');
        if (card) card.classList.remove('active');

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
            var apiUrl = (window.API_URL || 'http://localhost:3000');
            var res = await fetch(apiUrl + '/orders/cancel', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, window.APP_AUTH.getAuthHeaders()),
                body: JSON.stringify({ orderId: orderId, reason: 'Customer cancel' })
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
            await window.APP.fetchActiveOrder();
            if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.innerText = 'Batalkan Order'; }
        }
    },

    // ─── SUBMIT FLOW ─────────────────────────────────────────────────────────
    submitOrder: async function () {
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
        window.APP.openConfirmModal();
    },

    openConfirmModal: function () {
        var modal = document.getElementById('modal-confirm-order');
        var backdrop = document.getElementById('modal-backdrop');
        if (!modal) return;

        document.getElementById('confirm-origin').innerText = window.APP.state.pickup.address.split(',')[0];
        document.getElementById('confirm-dest').innerText = window.APP.state.dropoff.address.split(',')[0];

        var price = window.APP.calc.price || 0;
        document.getElementById('confirm-price').innerText = 'Rp ' + price.toLocaleString('id-ID');

        var paymentMethod = document.getElementById('payment-method-input').value;
        document.getElementById('confirm-method').innerText = (paymentMethod === 'QRIS') ? 'QRIS (Scan)' : 'TUNAI (Cash)';

        modal.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
    },

    closeConfirmModal: function () {
        var modal = document.getElementById('modal-confirm-order');
        var backdrop = document.getElementById('modal-backdrop');
        if (modal) modal.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    },

    processOrder: async function () {
        window.APP.closeConfirmModal();

        var btn = document.getElementById('btn-submit');
        if (btn) btn.classList.add('loading');

        try {
            var method = document.getElementById('payment-method-input').value || 'CASH';
            var response = null;

            if (method === 'QRIS') {
                response = await window.APP.createQrisOrder();
            } else {
                response = await window.APP.createCashOrder();
            }

            if (!response) throw new Error('No response from server');
            if (response.error) throw new Error(response.error);
            if (!response.success && response.message) throw new Error(response.message);

            await window.APP.fetchActiveOrder();
            if (window.APP.activeOrder) window.APP.startPolling();

        } catch (e) {
            console.error('[ORDER] Submit failed:', e);
            if (window.showToast) window.showToast('Gagal membuat order: ' + e.message);
        } finally {
            window.APP.updateSubmitButton();
        }
    },

    // ─── PRICING PREVIEW ─────────────────────────────────────────────────────
    fetchPricePreview: async function (pickupLocation, dropoffLocation, distanceKm) {
        window.APP.uiState = 'PRICING_LOADING';
        window.APP.updateSubmitButton();

        var priceDisplay = document.getElementById('price-display');
        var priceCard = document.getElementById('price-card');
        if (priceDisplay) priceDisplay.innerText = '...';
        if (priceCard) priceCard.style.display = 'flex';

        try {
            var apiUrl = (window.API_URL || 'http://localhost:3000');
            var previewBody = {
                service: window.APP.service,
                pickupLocation: pickupLocation,
                dropoffLocation: dropoffLocation,
                distanceKm: distanceKm
            };
            if (window.APP.service === 'CAR' || window.APP.service === 'CAR_XL') {
                previewBody.vehicle_variant = window.APP.carOptions.seats || 4;
            }
            var res = await fetch(apiUrl + '/pricing/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(previewBody)
            });

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
                window.APP.calc.price = data.price;
                window.APP.calc.distance = data.distanceKm || distanceKm || 0;

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
        } finally {
            if (window.APP.uiState === 'PRICING_LOADING') window.APP.uiState = 'IDLE';
            window.APP.updateSubmitButton();
        }
        return null;
    },

    // ─── SUBMIT BUTTON GATE ──────────────────────────────────────────────────
    updateSubmitButton: function () {
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        if (!btn || !btnText) return;

        var hasActiveOrder = !!window.APP.activeOrder;
        var hasPickup = !!(window.APP.state.pickup && window.APP.state.pickup.lat);
        var hasDropoff = !!(window.APP.state.dropoff && window.APP.state.dropoff.lat);
        var hasPrice = window.APP.calc.price > 0;
        var withinLimit = window.APP.calc.withinLimit !== false;
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
            btn.classList.add('loading');
            btn.classList.remove('disabled');
        } else if (!hasPrice) {
            btn.classList.add('disabled');
            btnText.innerText = 'Menunggu Harga...';
        } else {
            var displayService = 'Layanan';
            if (window.APP.service === 'RIDE') displayService = 'Ojek Motor';
            if (window.APP.service === 'SEND') displayService = 'Kirim Barang';
            if (window.APP.service === 'FOOD_MART') displayService = 'Food & Mart';
            if (window.APP.service === 'CAR' || window.APP.service === 'CAR_XL') {
                displayService = window.APP.carOptions.seats === 6 ? 'Mobil (6 Seat)' : 'Mobil (4 Seat)';
            }

            btn.classList.remove('disabled');
            btn.classList.remove('loading');
            btnText.innerText = 'Pesan ' + displayService + ' →';
        }
    },

    // ─── API HELPERS ─────────────────────────────────────────────────────────
    _buildPayload: function () {
        var svc = window.APP.service;
        var payload = {
            service: (svc === 'CAR_XL') ? 'CAR' : svc,
            customer_phone: localStorage.getItem('bj_phone') || '',
            session_key: localStorage.getItem('bj_token') || '',
            source: 'webapp',
            pickupLocation: { lat: window.APP.state.pickup.lat, lng: window.APP.state.pickup.lng },
            dropoffLocation: { lat: window.APP.state.dropoff.lat, lng: window.APP.state.dropoff.lng },
            destination: window.APP.state.dropoff.address,
            note: document.getElementById('note') ? document.getElementById('note').value : '',
            items: document.getElementById('items') ? document.getElementById('items').value : '',
            estPrice: document.getElementById('est-price') ? document.getElementById('est-price').value : ''
        };
        if (svc === 'CAR' || svc === 'CAR_XL') {
            payload.vehicle_variant = window.APP.carOptions.seats || 4;
        }
        return payload;
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
        var res = await fetch(apiUrl + endpoint, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, window.APP_AUTH.getAuthHeaders()),
            body: JSON.stringify(payload)
        });

        var text = await res.text();
        try { return JSON.parse(text); }
        catch (e) { throw new Error('Server Error: ' + res.status); }
    },

    // ─── QRIS MODAL ──────────────────────────────────────────────────────────
    openQrisModal: function (order) {
        if (!order) return;
        if (order.status !== 'WAITING_PAYMENT') return;
        if (!order.payment) return;
        if (!order.payment.expected_amount || order.payment.expected_amount <= 0) return;

        var amountEl = document.getElementById('qris-amount');
        var modal = document.getElementById('modal-qris');
        var countdownEl = document.getElementById('qris-countdown');

        if (amountEl && modal) {
            amountEl.innerText = 'Rp ' + (order.payment.expected_amount).toLocaleString('id-ID');
            modal.classList.add('active');
            var backdrop = document.getElementById('modal-backdrop');
            if (backdrop) backdrop.classList.add('active');

            window.APP._startQrisCountdown(15 * 60, countdownEl);
        }
    },

    _startQrisCountdown: function (totalSeconds, el) {
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
                window.APP.fetchActiveOrder();
            }
        }, 1000);
    },

    closeQrisModal: function () {
        var modal = document.getElementById('modal-qris');
        var backdrop = document.getElementById('modal-backdrop');
        if (modal) modal.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');

        if (window.APP._qrisCountdownTimer) {
            clearInterval(window.APP._qrisCountdownTimer);
            window.APP._qrisCountdownTimer = null;
        }
    },

    cancelQrisPayment: function () {
        window.APP.cancelActiveOrder();
        window.APP.closeQrisModal();
    }
};

// ─── GLOBAL BINDINGS ────────────────────────────────────────────────────────
window.setService = function (service, tabEl) { window.APP.setService(service, tabEl); };
window.updateLink = function () { window.APP.updateSubmitButton(); };
window.submitOrder = function () { window.APP.submitOrder(); };
window.openConfirmModal = function () { window.APP.openConfirmModal(); };
window.closeConfirmModal = function () { window.APP.closeConfirmModal(); };
window.processOrder = function () { window.APP.processOrder(); };
window.selectPayment = function (method, el) {
    document.getElementById('payment-method-input').value = method;
    var cards = document.querySelectorAll('.payment-card');
    cards.forEach(function (c) { c.classList.remove('selected'); });
    el.classList.add('selected');
};
window.closeQrisModal = function () { window.APP.closeQrisModal(); };
window.openQrisModal = function (o) { window.APP.openQrisModal(o); };
window.cancelActiveOrder = function () { window.APP.cancelActiveOrder(); };
window.cancelQrisPayment = function () { window.APP.cancelQrisPayment(); };
window.finishQrisPayment = async function () {
    if (window.showToast) window.showToast('⏳ Mengecek pembayaran...');
    await window.APP.fetchActiveOrder();
    var order = window.APP.activeOrder;
    if (order && order.status === 'WAITING_PAYMENT') {
        if (window.showToast) window.showToast('Pembayaran belum terkonfirmasi. Coba lagi.');
        window.APP.openQrisModal(order);
    } else {
        window.APP.closeQrisModal();
    }
};

// Page Visibility — immediately sync when tab becomes visible again
document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window.APP.activeOrder) {
        window.APP.fetchActiveOrder();
    }
});

// DOMContentLoaded: only boots auth recovery (fetchActiveOrder).
// Does NOT call setService — that happens in initMap() after the map is ready.
document.addEventListener('DOMContentLoaded', window.APP.initApp);