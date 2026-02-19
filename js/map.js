/* ========================
   map.js - Deterministic Routing Engine
   Refactor: single init path, request-ID guard, no silent travelMode fallback.
   ======================== */

// ─── 0. CONSTANTS ────────────────────────────────────────────────────────────
var JAVA_BOUNDS = {
    south: -9.5, west: 104.5,
    north: -5.0, east: 115.5
};

// ─── 1. MODULE STATE ─────────────────────────────────────────────────────────
var map = null;
var ds = null;
var dr = null;
var geocoder = null;
var pickerMap = null;

// Request-ID guard — only the most recent ds.route() call may commit to dr.
var _currentRouteRequestId = 0;

// Single debounce timer for the unified triggerRoute() function.
var _routeTimer = null;
var _routeDelay = 600; // ms

// ─── 2. INTERNAL: UNIFIED ROUTE TRIGGER ──────────────────────────────────────
// ALL route draw requests funnel through here — no exceptions.
// Debounces rapid calls and cancels in-flight stale requests via request-ID.
function triggerRoute() {
    if (_routeTimer) clearTimeout(_routeTimer);
    _routeTimer = setTimeout(function () {
        _routeTimer = null;
        window.APP_MAP.drawRoute();
    }, _routeDelay);
}

// ─── 3. APP_MAP NAMESPACE ────────────────────────────────────────────────────
window.APP_MAP = {

    getServiceMapSettings: function (service) {
        return {
            center: { lat: -7.3305, lng: 110.5084 },
            zoom: service === 'CAR' ? 10 : 13
        };
    },

    cleanAddress: function (address) {
        if (!address) return '';
        return address.replace(/^[A-Z0-9\+]{4,8}(\+[A-Z0-9]{2,})?,\s*/, '');
    },

    updateLocationState: function (field, lat, lng, source, address) {
        if (window.APP && window.APP.state) {
            window.APP.state[field] = { lat: lat, lng: lng, source: source, address: address };
        }
        var placeType = field === 'pickup' ? 'origin' : 'dest';
        window.APP.places[placeType] = {
            geometry: { location: new google.maps.LatLng(lat, lng) },
            formatted_address: address
        };
    },

    initAutocomplete: function () {
        var originEl = document.getElementById('origin');
        var destEl = document.getElementById('destination');
        if (!originEl || !destEl) return;

        var bounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(-7.78, 110.05),
            new google.maps.LatLng(-6.88, 110.95)
        );
        var options = {
            bounds: bounds,
            componentRestrictions: { country: 'id' },
            fields: ['geometry', 'name', 'formatted_address'],
            strictBounds: false,
            types: ['establishment', 'geocode']
        };

        var acOrigin = new google.maps.places.Autocomplete(originEl, options);
        var acDest = new google.maps.places.Autocomplete(destEl, options);

        if (map) {
            acOrigin.bindTo('bounds', map);
            acDest.bindTo('bounds', map);
        }

        acOrigin.addListener('place_changed', function () {
            window.APP_MAP.handlePlaceSelect('origin', acOrigin);
        });
        acDest.addListener('place_changed', function () {
            window.APP_MAP.handlePlaceSelect('dest', acDest);
        });
    },

    handlePlaceSelect: function (type, ac) {
        if (window.APP.picker.locked) return;
        var place = ac.getPlace();
        if (!place || !place.geometry) return;

        var inputId = type === 'origin' ? 'origin' : 'destination';
        var cleaned = window.APP_MAP.cleanAddress(place.formatted_address);
        document.getElementById(inputId).value = cleaned;
        window.toggleClearBtn(inputId);

        var field = type === 'origin' ? 'pickup' : 'dropoff';
        window.APP_MAP.updateLocationState(field, place.geometry.location.lat(), place.geometry.location.lng(), 'autocomplete', cleaned);
        window.APP_MAP.updateMarker(type, place.geometry.location.lat(), place.geometry.location.lng());
        triggerRoute();
    },

    updateMarker: function (type, lat, lng) {
        if (!map) return;
        var markers = window.APP.markers;
        var iconUrl = type === 'origin'
            ? 'https://cdn-icons-png.flaticon.com/512/684/684908.png'
            : 'https://cdn-icons-png.flaticon.com/512/684/684913.png';

        if (markers[type]) markers[type].setMap(null);

        markers[type] = new google.maps.Marker({
            position: { lat: lat, lng: lng },
            map: map,
            icon: { url: iconUrl, scaledSize: new google.maps.Size(40, 40) },
            label: { text: type === 'origin' ? 'Jemput' : 'Tujuan', color: 'black', fontWeight: 'bold', fontSize: '12px' }
        });

        if (markers.origin && markers.dest) {
            var bounds = new google.maps.LatLngBounds();
            bounds.extend(markers.origin.getPosition());
            bounds.extend(markers.dest.getPosition());
            map.fitBounds(bounds, { padding: 60 });
        } else {
            map.setCenter({ lat: lat, lng: lng });
            map.setZoom(16);
        }
    },

    // ─── ROUTING ─────────────────────────────────────────────────────────────
    drawRoute: function () {
        if (!map || !ds || !dr) return;

        if (!google || !google.maps || !google.maps.TravelMode) {
            console.error('[MAP] Google Maps API not ready');
            return;
        }

        var origin = window.APP.places.origin;
        var dest = window.APP.places.dest;

        if (!origin || !origin.geometry || !origin.geometry.location) return;
        if (!dest || !dest.geometry || !dest.geometry.location) return;

        window.APP_MAP.setLoading(true);
        document.getElementById('error-card').style.display = 'none';

        var serviceKey = window.APP.service || 'RIDE';
        var isCar = (serviceKey === 'CAR' || serviceKey === 'CAR_XL');

        // ── DETERMINISTIC TRAVEL MODE ─────────────────────────────────────────
        // TWO_WHEELER requires &v=beta SDK and is region-dependent.
        // Check availability explicitly — no silent || fallback.
        // If unavailable, log a visible warning and fall to DRIVING.
        // Pricing is always backend-authoritative and unaffected by this choice.
        var travelMode;
        if (isCar) {
            travelMode = google.maps.TravelMode.DRIVING;
        } else if (google.maps.TravelMode.TWO_WHEELER) {
            travelMode = google.maps.TravelMode.TWO_WHEELER;
        } else {
            console.warn('[MAP] TWO_WHEELER unavailable in this SDK region. Using DRIVING for route geometry. Pricing remains backend-authoritative.');
            travelMode = google.maps.TravelMode.DRIVING;
        }
        // ─────────────────────────────────────────────────────────────────────

        // Stamp this request. Any earlier in-flight call with a stale ID
        // will see requestId !== _currentRouteRequestId and discard its result.
        var requestId = ++_currentRouteRequestId;

        ds.route({
            origin: origin.geometry.location,
            destination: dest.geometry.location,
            travelMode: travelMode,
            avoidTolls: !window.APP.carOptions.toll,
            provideRouteAlternatives: true
        }, function (result, status) {

            // ── REQUEST-ID GUARD ──────────────────────────────────────────────
            // If a newer request was issued while this one was in flight,
            // discard this result. Prevents renderer overwrite by stale calls.
            if (requestId !== _currentRouteRequestId) {
                console.log('[MAP] Stale route result discarded (id=' + requestId + ', current=' + _currentRouteRequestId + ')');
                window.APP_MAP.setLoading(false);
                return;
            }
            // ─────────────────────────────────────────────────────────────────

            window.APP_MAP.setLoading(false);

            if (status !== google.maps.DirectionsStatus.OK) {
                window.APP_MAP.showError('Waduh, rute tidak ditemukan. Coba geser titiknya dikit ya Kak! 🗺️');
                window.APP.calc.price = 0;
                window.APP.calc.withinLimit = false;
                document.getElementById('price-card').style.display = 'none';
                window.updateLink();
                return;
            }

            // Select SHORTEST route among alternatives
            var shortestIndex = 0;
            var shortestDist = Infinity;
            if (result.routes && result.routes.length > 0) {
                for (var i = 0; i < result.routes.length; i++) {
                    var dist = result.routes[i].legs.reduce(function (sum, leg) {
                        return sum + leg.distance.value;
                    }, 0);
                    if (dist < shortestDist) { shortestDist = dist; shortestIndex = i; }
                }
            }

            dr.setDirections(result);
            dr.setRouteIndex(shortestIndex);

            console.log('[ROUTE] travelMode=' + travelMode + ' | alternatives=' + result.routes.length + ' | selected #' + shortestIndex + ' = ' + shortestDist + 'm');

            if (result.routes[shortestIndex] && result.routes[shortestIndex].bounds) {
                map.fitBounds(result.routes[shortestIndex].bounds, { padding: 60 });
            }

            var leg = result.routes[shortestIndex].legs[0];
            var distanceKm = leg.distance.value / 1000;
            var durationMins = Math.ceil(leg.duration.value / 60);

            window.APP._distanceDebug = { rawMeters: leg.distance.value, frontendKm: distanceKm };
            console.log('[DISTANCE] Google Directions:', leg.distance.value, 'm →', distanceKm.toFixed(3), 'km');

            // Max distance enforcement (uses backend config if available, else conservative default)
            var _pricingCfg = window.APP.getPricingConfig(serviceKey);
            var maxKm = (_pricingCfg && _pricingCfg.constraints && _pricingCfg.constraints.max_distance_km)
                ? _pricingCfg.constraints.max_distance_km : 25;
            var _maxDistMsg = (_pricingCfg && _pricingCfg.constraints && _pricingCfg.constraints.max_distance_error_msg)
                ? _pricingCfg.constraints.max_distance_error_msg
                : 'Jarak melebihi batas layanan (' + maxKm + 'km untuk ' + serviceKey + ')';

            if (distanceKm > maxKm) {
                window.APP.calc.price = 0;
                window.APP.calc.withinLimit = false;
                window.APP.calc.distance = parseFloat(distanceKm.toFixed(2));
                document.getElementById('price-card').style.display = 'none';
                document.getElementById('dist-display').innerText = distanceKm.toFixed(1) + ' km';
                window.APP_MAP.showError(_maxDistMsg);
                if (window.showToast) window.showToast('Jarak melebihi batas layanan');
                window.updateLink();
                return;
            }

            window.APP.calc = {
                distance: parseFloat(distanceKm.toFixed(2)),
                duration: durationMins,
                price: 0,
                withinLimit: true
            };
            document.getElementById('dist-display').innerText = distanceKm.toFixed(1) + ' km (' + durationMins + ' mnt)';

            // Backend pricing authority — unchanged from original
            var pickup = window.APP.state.pickup;
            var dropoff = window.APP.state.dropoff;

            if (pickup && pickup.lat && dropoff && dropoff.lat && window.APP.fetchPricePreview) {
                window.APP.fetchPricePreview(
                    { lat: pickup.lat, lng: pickup.lng },
                    { lat: dropoff.lat, lng: dropoff.lng },
                    distanceKm
                ).then(function (backendPrice) {
                    if (!backendPrice) {
                        console.warn('[PRICING] Backend preview failed. Submit disabled.');
                        window.APP.calc.price = 0;
                        document.getElementById('price-card').style.display = 'none';
                        if (window.showToast) window.showToast('Server pricing sibuk, coba lagi sebentar');
                        window.updateLink();
                    } else {
                        document.getElementById('price-card').style.display = 'flex';
                        window.updateLink();
                    }
                });
            } else {
                window.APP.calc.price = 0;
                document.getElementById('price-card').style.display = 'none';
                window.updateLink();
            }
        });
    },

    showError: function (msg) {
        var errCard = document.getElementById('error-card');
        var priceCard = document.getElementById('price-card');
        if (errCard) { errCard.style.display = 'block'; errCard.innerText = '✋ ' + msg; }
        if (priceCard) priceCard.style.display = 'none';
        window.APP.calc.price = 0;
        window.updateLink();
    },

    setLoading: function (state) {
        var spin = document.getElementById('loading-spin');
        var txt = document.getElementById('btn-text');
        if (state) {
            if (spin) spin.style.display = 'block';
            if (txt) txt.style.display = 'none';
        } else {
            if (spin) spin.style.display = 'none';
            if (txt) txt.style.display = 'block';
        }
    },

    checkHistory: function () {
        var stored = sessionStorage.getItem('bantujeg_history');
        if (!stored) return;
        try {
            var data = JSON.parse(stored);
            if (data && data.origin_addr && data.dest_addr) {
                window.APP.historyData = data;
                var histText = document.getElementById('history-text');
                var histChip = document.getElementById('history-chip');
                if (histText) histText.innerText = '🕒 Pakai Rute Terakhir: ' +
                    window.APP_MAP.cleanAddress(data.origin_addr) + ' → ' +
                    window.APP_MAP.cleanAddress(data.dest_addr);
                if (histChip) histChip.style.display = 'flex';
            }
        } catch (e) { console.error(e); }
    },

    useHistory: function () {
        var data = window.APP.historyData;
        if (!data) return;

        document.getElementById('history-chip').style.display = 'none';
        document.getElementById('origin').value = data.origin_addr;
        document.getElementById('destination').value = data.dest_addr;

        if (data.note) {
            var noteInput = document.getElementById('note');
            noteInput.value = data.note;
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

        window.APP_MAP.updateMarker('origin', data.origin_lat, data.origin_lng);
        window.APP_MAP.updateMarker('dest', data.dest_lat, data.dest_lng);
        window.expandMap();
        triggerRoute(); // ← unified trigger; was direct drawRoute() call
        window.toggleClearBtn('origin');
        window.toggleClearBtn('destination');
    },

    // ─── MAP PICKER ──────────────────────────────────────────────────────────
    _initPickerMap: function () {
        if (pickerMap) {
            google.maps.event.trigger(pickerMap, 'resize');
            return;
        }

        var el = document.getElementById('picker-map');
        if (!el) return;

        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
            setTimeout(window.APP_MAP._initPickerMap, 100);
            return;
        }

        var mapSettings = window.APP_MAP.getServiceMapSettings(window.APP.service);
        pickerMap = new google.maps.Map(el, {
            center: mapSettings.center,
            zoom: mapSettings.zoom + 4,
            gestureHandling: 'greedy',
            disableDefaultUI: true,
            clickableIcons: false,
            zoomControl: true
        });
        window.APP.pickerMap = pickerMap;

        pickerMap.addListener('idle', function () {
            var center = pickerMap.getCenter();
            window.APP.picker.currentLocation = { lat: center.lat(), lng: center.lng() };
        });

        google.maps.event.trigger(pickerMap, 'resize');
    },

    openMapPicker: function (type) {
        window.APP.picker.locked = true;
        window.APP.picker.activeField = type === 'origin' ? 'pickup' : 'dropoff';

        var modal = document.getElementById('map-picker-modal');
        if (!modal) return;
        modal.classList.add('active');

        var titleEl = document.getElementById('picker-title');
        var labelEl = document.getElementById('pin-label');
        if (titleEl) titleEl.innerText = type === 'origin' ? 'Tentukan Titik Jemput' : 'Tentukan Tujuan';
        if (labelEl) labelEl.innerText = type === 'origin' ? 'Lokasi Jemput' : 'Lokasi Tujuan';

        history.pushState({ mapPicker: true }, '', '');

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                setTimeout(function () {
                    window.APP_MAP._initPickerMap();
                    if (pickerMap) {
                        var field = type === 'origin' ? 'origin' : 'dest';
                        var existingPlace = window.APP.places[field];
                        if (existingPlace && existingPlace.geometry) {
                            var lat = existingPlace.geometry.location.lat();
                            var lng = existingPlace.geometry.location.lng();
                            window.APP.picker.currentLocation = { lat: lat, lng: lng };
                            pickerMap.setCenter({ lat: lat, lng: lng });
                            pickerMap.setZoom(18);
                        }
                    }
                }, 50);
            });
        });
    },

    closeMapPicker: function () {
        var modal = document.getElementById('map-picker-modal');
        if (modal) modal.classList.remove('active');
        window.APP.picker.locked = false;
        window.APP.picker.activeField = null;
        if (history.state && history.state.mapPicker) history.back();
    },

    confirmLocation: function () {
        var activeField = window.APP.picker.activeField;
        var loc = window.APP.picker.currentLocation;
        if (!activeField || !loc) return;

        var lat = loc.lat;
        var lng = loc.lng;
        var inputId = activeField === 'pickup' ? 'origin' : 'destination';

        var confirmBtn = document.getElementById('confirm-btn');
        var addressDisplay = document.getElementById('picker-address');
        if (confirmBtn) confirmBtn.disabled = true;
        if (addressDisplay) addressDisplay.innerText = 'Mencari alamat...';

        if (!geocoder) geocoder = new google.maps.Geocoder();
        var geocodeRequestId = Date.now();
        window.APP.picker.geocodeRequest = geocodeRequestId;

        geocoder.geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
            if (window.APP.picker.geocodeRequest !== geocodeRequestId) return;
            if (confirmBtn) confirmBtn.disabled = false;

            if (status !== 'OK' || !results[0]) {
                if (addressDisplay) addressDisplay.innerText = 'Gagal mendapatkan alamat. Coba lagi.';
                return;
            }

            var address = window.APP_MAP.cleanAddress(results[0].formatted_address);
            document.getElementById(inputId).value = address;
            window.toggleClearBtn(inputId);

            window.APP_MAP.updateLocationState(activeField, lat, lng, 'manual', address);

            var markerType = activeField === 'pickup' ? 'origin' : 'dest';
            window.APP_MAP.updateMarker(markerType, lat, lng);
            window.expandMap();

            if (window.APP.places.origin && window.APP.places.dest) triggerRoute(); // ← unified trigger; was direct drawRoute()
            window.APP_MAP.closeMapPicker();
        });
    },

    // ─── GPS ─────────────────────────────────────────────────────────────────
    getCurrentLocation: function (inputType) {
        if (window.APP.picker.locked) return;
        if (!navigator.geolocation) {
            if (window.showToast) window.showToast('Browser tidak support GPS');
            else alert('Browser tidak support GPS');
            return;
        }

        var btnEl = document.getElementById('gps-' + inputType);
        if (!btnEl) return;
        var original = btnEl.innerHTML;
        btnEl.innerHTML = '⏳ Tunggu...';

        var field = inputType === 'origin' ? 'pickup' : 'dropoff';
        var existing = window.APP.state[field];

        if (existing && existing.source === 'manual' && existing.lat) {
            btnEl.innerHTML = original;
            if (window.showToast) window.showToast('Lokasi sudah diatur manual. Hapus dulu untuk gunakan GPS.');
            else alert('Lokasi sudah diatur manual. Hapus dulu untuk gunakan GPS.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                var lat = position.coords.latitude;
                var lng = position.coords.longitude;
                if (!geocoder) geocoder = new google.maps.Geocoder();

                geocoder.geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
                    btnEl.innerHTML = original;
                    if (status === 'OK' && results[0]) {
                        var cleaned = window.APP_MAP.cleanAddress(results[0].formatted_address);
                        var type = inputType === 'origin' ? 'origin' : 'dest';
                        document.getElementById(inputType).value = cleaned;
                        window.toggleClearBtn(inputType);
                        window.APP_MAP.updateLocationState(field, lat, lng, 'gps', cleaned);
                        window.APP_MAP.updateMarker(type, lat, lng);
                        window.expandMap();
                        if (window.APP.places.origin && window.APP.places.dest) triggerRoute();
                    } else {
                        if (window.showToast) window.showToast('Gagal mendeteksi nama jalan.');
                        else alert('Gagal mendeteksi nama jalan.');
                    }
                });
            },
            function () {
                btnEl.innerHTML = original;
                if (window.showToast) window.showToast('Gagal ambil lokasi. Pastikan GPS nyala!');
                else alert('Gagal ambil lokasi. Pastikan GPS nyala!');
            },
            { timeout: 10000, maximumAge: 30000 }
        );
    }
};

// ─── 4. GLOBAL HELPERS ───────────────────────────────────────────────────────
window.useHistory = window.APP_MAP.useHistory;
window.openMapPicker = window.APP_MAP.openMapPicker;
window.closeMapPicker = window.APP_MAP.closeMapPicker;
window.confirmLocation = window.APP_MAP.confirmLocation;
window.getCurrentLocation = window.APP_MAP.getCurrentLocation;
window.getServiceMapSettings = window.APP_MAP.getServiceMapSettings;

// Expose triggerRoute as the ONLY public route trigger.
// setService() and handleCarOptionChange() in app.js call this.
// Nothing outside this file ever calls drawRoute() directly.
window.triggerRoute = triggerRoute;

window.expandMap = function () { document.getElementById('map-container').classList.add('expanded'); };
window.setActiveField = function (field) { if (window.APP && window.APP.picker) window.APP.picker.activeField = field; };

window.toggleClearBtn = function (id) {
    var input = document.getElementById(id);
    var btn = document.getElementById('clear-' + id);
    if (!input || !btn) return;
    btn.style.display = input.value.length > 0 ? 'flex' : 'none';
};

window.clearInput = function (id) {
    var input = document.getElementById(id);
    if (!input) return;
    input.value = '';
    window.toggleClearBtn(id);
    if (id === 'origin' || id === 'destination') {
        var type = id === 'origin' ? 'origin' : 'dest';
        var field = id === 'origin' ? 'pickup' : 'dropoff';
        window.APP.places[type] = null;
        if (window.APP.state) window.APP.state[field] = { lat: null, lng: null, source: null, address: '' };
        if (window.APP.markers[type]) { window.APP.markers[type].setMap(null); window.APP.markers[type] = null; }
        window.APP.calc.price = 0;
        window.APP.calc.withinLimit = false;
        document.getElementById('price-card').style.display = 'none';
        window.updateLink();
    }
};

window.handleInput = function (id) { window.toggleClearBtn(id); };

window.addNote = function (text) {
    var noteInput = document.getElementById('note');
    if (!noteInput) return;
    noteInput.value = noteInput.value.length > 0 ? noteInput.value + ', ' + text : text;
    window.updateLink();
};

window.handleCarOptionChange = function () {
    var selected = document.querySelector('input[name="car-seat"]:checked');
    var seatValue = selected ? parseInt(selected.value, 10) : 4;
    window.APP.carOptions.seats = seatValue;
    window.APP.carOptions.toll = document.getElementById('car-toll').checked;

    if (window.APP.service === 'CAR' || window.APP.service === 'CAR_XL') {
        window.APP.service = (seatValue === 6) ? 'CAR_XL' : 'CAR';
        console.log('[SERVICE] Seat changed to', seatValue, '→ service:', window.APP.service);
    }

    if (window.APP.places.origin && window.APP.places.dest) triggerRoute();
};

window.addEventListener('popstate', function (event) {
    var modal = document.getElementById('map-picker-modal');
    if (modal && modal.classList.contains('active')) {
        window.APP_MAP.closeMapPicker();
        event.preventDefault();
    }
});

// ─── 5. INIT MAP — SOLE INITIALIZATION ENTRY POINT ───────────────────────────
// Google Maps SDK calls this via &callback=initMap after async load.
// This is the ONLY place the map, ds, dr are created.
// app.js initApp() does NOT call setService — only fetchActiveOrder (side-effect-free).
// setService('RIDE') is called exactly ONCE, here, after map is ready.
function initMap() {
    console.log('[initMap] Google Maps API ready. Starting sole initialization sequence.');
    if (!document.getElementById('map')) return;

    try {
        var mapSettings = window.APP_MAP.getServiceMapSettings('RIDE');

        map = new google.maps.Map(document.getElementById('map'), {
            center: mapSettings.center,
            zoom: mapSettings.zoom,
            disableDefaultUI: true,
            clickableIcons: false,
            minZoom: 8,
            restriction: {
                latLngBounds: JAVA_BOUNDS,
                strictBounds: false
            }
        });
        window.APP.map = map;

        ds = new google.maps.DirectionsService();
        dr = new google.maps.DirectionsRenderer({
            suppressMarkers: false,
            preserveViewport: true,
            polylineOptions: { strokeColor: '#4285F4', strokeWeight: 5 }
        });
        dr.setMap(map);
        window.APP.directionsRenderer = dr;

        geocoder = new google.maps.Geocoder();

        // Gate flag — setService() checks this before triggering any route draw.
        window._mapReady = true;

        // Autocomplete init — short delay ensures map DOM is fully painted.
        setTimeout(function () { window.APP_MAP.initAutocomplete(); }, 300);

        // History chip — display only, no route draw.
        window.APP_MAP.checkHistory();

        // ── SINGLE setService CALL ON STARTUP ────────────────────────────────
        // Exactly one call. initApp() does NOT call setService.
        // Since no places are set yet, setService will NOT trigger a route draw here.
        var defaultTab = document.querySelector('.tab[data-service="RIDE"]') || document.querySelector('.tab');
        if (window.setService) window.setService('RIDE', defaultTab);
        // ─────────────────────────────────────────────────────────────────────

        console.log('[initMap] Complete. _mapReady=true');

    } catch (err) {
        console.error('[initMap] CRITICAL: Map initialization failed.', err);
        window._mapReady = false;
    }
}

window.initMap = initMap;