/* ========================
   map.js - The Maps Cables
   ======================== */

// ─── 0. PRICING AUTHORITY (SOURCE OF TRUTH) ─────────────────────────────────
// Fallback configuration if backend is unreachable
const FALLBACK_CONFIG = {
    RIDE: {
        base_price: 8000,
        base_distance_km: 2,
        price_per_km: 2000,
        distance_logic: { lmf: 1.25, detour_limit: 1.15 }
    },
    CAR: {
        base_price: 15000,
        base_distance_km: 2,
        price_per_km: 3500
    },
    FOOD_MART: {
        base_price: 4000,
        base_distance_km: 0,
        price_per_km: 2000
    },
    SEND: {
        base_price: 8000,
        base_distance_km: 2,
        price_per_km: 2000
    }
};

// ─── 1. TOP-LEVEL DECLARATIONS ONLY ─────────────────────────────────────────
var map = null;
var ds = null;
var dr = null;
var geocoder = null;
var pickerMap = null;

// ─── 2. APP_MAP NAMESPACE ────────────────────────────────────────────────────
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
        window.APP_MAP.drawRoute();
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

    // ─── PRICING ─────────────────────────────────────────────────────────────
    fetchPricingConfig: function () {
        console.log('[PRICING] Fetching config from backend...');

        // Use endpoint: /orders/config
        var apiUrl = (window.API_URL || 'http://localhost:8080') + '/orders/config';

        fetch(apiUrl)
            .then(function (res) {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.json();
            })
            .then(function (data) {
                var config = data.success && data.data ? data.data : data;
                if (Object.keys(config).length === 0) throw new Error('Empty config');

                console.log('[PRICING] Configuration loaded:', config);
                window.APP.config = config;
            })
            .catch(function (error) {
                console.warn('[PRICING] Failed to load config, using FALLBACK.', error);
                window.APP.config = FALLBACK_CONFIG;
            });
    },

    calculatePrice: function (distance) {
        // DISPLAY ONLY — backend remains pricing authority
        // This function NEVER sets APP.calc.price. Submit button stays disabled.
        var service = window.APP.service;

        // Try backend config first (tiered), fall back to simple FALLBACK_CONFIG
        var backendConfig = window.APP.getPricingConfig ? window.APP.getPricingConfig(service) : null;
        var estimate = 0;

        if (backendConfig && backendConfig.pricing_model && backendConfig.pricing_model.tiers) {
            // Use tiered model from backend config
            var tiers = backendConfig.pricing_model.tiers;
            var tier = null;
            for (var i = 0; i < tiers.length; i++) {
                if (distance >= tiers[i].min_km && distance < tiers[i].max_km) {
                    tier = tiers[i];
                    break;
                }
            }
            // Use last tier if beyond all ranges
            if (!tier) tier = tiers[tiers.length - 1];

            if (tier) {
                if (tier.calculation_type === 'FLAT') {
                    estimate = tier.base_price;
                } else {
                    estimate = tier.base_price + ((distance - tier.offset_km) * tier.price_per_km);
                }
            }

            // Rounding policy
            var policy = backendConfig.pricing_model.rounding_policy || 'NEAREST_500_UP';
            var roundTo = policy === 'NEAREST_100_UP' ? 100 : 500;
            estimate = Math.ceil(estimate / roundTo) * roundTo;
        } else {
            // Fallback to simple config
            var config = FALLBACK_CONFIG[service];
            if (!config) {
                console.warn('[PRICING] No fallback config for ' + service);
                return;
            }
            if (distance <= config.base_distance_km) {
                estimate = config.base_price;
            } else {
                estimate = config.base_price + ((distance - config.base_distance_km) * config.price_per_km);
            }
            estimate = Math.ceil(estimate / 500) * 500;
        }

        var fakeEstimate = Math.ceil((estimate * 1.10) / 500) * 500;

        // Show as estimate — APP.calc.price stays 0 (submit stays disabled)
        var priceDisplay = document.getElementById('price-display');
        var fakeDisplay = document.getElementById('fake-price');
        var distDisplay = document.getElementById('dist-display');
        var priceCard = document.getElementById('price-card');
        if (priceDisplay) priceDisplay.innerText = '~Rp ' + estimate.toLocaleString('id-ID') + ' — Estimasi sementara';
        if (fakeDisplay) fakeDisplay.innerText = 'Rp ' + fakeEstimate.toLocaleString('id-ID');
        if (distDisplay) distDisplay.innerText = distance.toFixed(1) + ' km';
        if (priceCard) priceCard.style.display = 'flex';
        // Do NOT call updateSubmitButton — price is not confirmed by backend
    },

    // ─── ROUTING ─────────────────────────────────────────────────────────────
    drawRoute: function () {
        if (!map || !ds || !dr) return;
        var origin = window.APP.places.origin;
        var dest = window.APP.places.dest;
        if (!origin || !dest) return;

        var SALATIGA = { lat: -7.3305, lng: 110.5084 };
        var distFromBase = google.maps.geometry.spherical.computeDistanceBetween(
            origin.geometry.location,
            new google.maps.LatLng(SALATIGA.lat, SALATIGA.lng)
        ) / 1000;

        if (distFromBase > 15) {
            window.APP_MAP.showError('Mohon maaf Kak, saat ini armada kami hanya melayani penjemputan di area Salatiga & Sekitarnya. 🙏');
            return;
        }

        window.APP_MAP.setLoading(true);
        document.getElementById('error-card').style.display = 'none';

        var serviceKey = window.APP.service;

        // STRICT ROUTING MODE based on Service Type
        var travelMode = google.maps.TravelMode.TWO_WHEELER; // Default for RIDE, SEND, FOOD
        if (serviceKey === 'CAR') {
            travelMode = google.maps.TravelMode.DRIVING;
        }

        ds.route({
            origin: origin.geometry.location,
            destination: dest.geometry.location,
            travelMode: travelMode,
            avoidTolls: !window.APP.carOptions.toll
        }, function (result, status) {
            window.APP_MAP.setLoading(false);

            if (status !== google.maps.DirectionsStatus.OK) {
                window.APP_MAP.showError('Waduh, rute tidak ditemukan. Coba geser titiknya dikit ya Kak! 🗺️');
                window.APP.calc.price = 0;
                document.getElementById('price-card').style.display = 'none';
                window.updateLink();
                return;
            }

            dr.setDirections(result);
            if (result.routes[0] && result.routes[0].bounds) {
                map.fitBounds(result.routes[0].bounds, { padding: 60 });
            }

            var leg = result.routes[0].legs[0];
            var distanceKm = leg.distance.value / 1000;
            var durationMins = Math.ceil(leg.duration.value / 60);
            var finalKm = distanceKm;

            // Motor Distance Logic (If Applicable)
            if (serviceKey !== 'CAR') {
                var straightKm = google.maps.geometry.spherical.computeDistanceBetween(
                    leg.start_location, leg.end_location
                ) / 1000;

                var config = window.APP.config && window.APP.config[serviceKey]
                    ? window.APP.config[serviceKey]
                    : FALLBACK_CONFIG[serviceKey];

                var logic = config.distance_logic || { lmf: 1.25, detour_limit: 1.15 };

                // Only apply logic if lmf/detour_limit exists (RIDE usually has it)
                if (logic && logic.lmf) {
                    var motorEstimate = straightKm * logic.lmf;
                    if (distanceKm > motorEstimate * logic.detour_limit) finalKm = motorEstimate;
                    else if (distanceKm < straightKm * 1.05) finalKm = straightKm * 1.10;
                }
            }

            window.APP.calc = { distance: parseFloat(finalKm.toFixed(2)), duration: durationMins };
            document.getElementById('dist-display').innerText = window.APP.calc.distance.toFixed(1) + ' km (' + durationMins + ' mnt)';

            // Backend pricing preview is the ONLY authority for APP.calc.price
            var pickup = window.APP.state.pickup;
            var dropoff = window.APP.state.dropoff;

            if (pickup && pickup.lat && dropoff && dropoff.lat && window.APP.fetchPricePreview) {
                window.APP.fetchPricePreview(
                    { lat: pickup.lat, lng: pickup.lng },
                    { lat: dropoff.lat, lng: dropoff.lng },
                    finalKm
                ).then(function (backendPrice) {
                    if (!backendPrice) {
                        // Backend failed — show display-only estimate, submit stays DISABLED
                        console.warn('[PRICING] Backend preview failed. Showing estimate only. Submit disabled.');
                        window.APP.calc.price = 0;
                        window.APP_MAP.calculatePrice(finalKm);
                        window.APP.updateSubmitButton();
                    }
                    document.getElementById('price-card').style.display = 'flex';
                    window.updateLink();
                });
            } else {
                // No coords yet — show estimate only, submit stays disabled
                window.APP.calc.price = 0;
                window.APP_MAP.calculatePrice(finalKm);
                document.getElementById('price-card').style.display = 'flex';
                window.updateLink();
            }
        });
    },

    showError: function (msg) {
        var errCard = document.getElementById('error-card');
        var priceCard = document.getElementById('price-card');
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        if (errCard) { errCard.style.display = 'block'; errCard.innerText = '✋ ' + msg; }
        if (priceCard) priceCard.style.display = 'none';
        if (btn) btn.classList.add('disabled');
        if (btnText) btnText.innerText = 'Jarak Terlalu Jauh';
        window.APP.calc.price = 0;
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
        var stored = localStorage.getItem('bantujeg_history');
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
        window.APP_MAP.drawRoute();
        window.toggleClearBtn('origin');
        window.toggleClearBtn('destination');
    },

    // ─── MAP PICKER (With Double Paint Protection) ───────────────────────────
    _initPickerMap: function () {
        if (pickerMap) {
            google.maps.event.trigger(pickerMap, 'resize');
            return;
        }

        var el = document.getElementById('picker-map');
        if (!el) return;

        // Still hidden? Retry.
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

        // Double rAF to ensure modal is painted
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                setTimeout(function () {
                    window.APP_MAP._initPickerMap();

                    // Logic to center map on existing point
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
        var requestId = Date.now();
        window.APP.picker.geocodeRequest = requestId;

        geocoder.geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
            if (window.APP.picker.geocodeRequest !== requestId) return;
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

            if (window.APP.places.origin && window.APP.places.dest) window.APP_MAP.drawRoute();
            window.APP_MAP.closeMapPicker();
        });
    },

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
                        if (window.APP.places.origin && window.APP.places.dest) window.APP_MAP.drawRoute();
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

// ─── 3. GLOBAL HELPERS ───────────────────────────────────────────────────────
window.useHistory = window.APP_MAP.useHistory;
window.openMapPicker = window.APP_MAP.openMapPicker;
window.closeMapPicker = window.APP_MAP.closeMapPicker;
window.confirmLocation = window.APP_MAP.confirmLocation;
window.getCurrentLocation = window.APP_MAP.getCurrentLocation;
window.getServiceMapSettings = window.APP_MAP.getServiceMapSettings;

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
    window.APP.carOptions.seats = selected ? parseInt(selected.value, 10) : 4;
    window.APP.carOptions.toll = document.getElementById('car-toll').checked;
    if (window.APP.places.origin && window.APP.places.dest) window.APP_MAP.drawRoute();
};
window.addEventListener('popstate', function (event) {
    var modal = document.getElementById('map-picker-modal');
    if (modal && modal.classList.contains('active')) {
        window.APP_MAP.closeMapPicker();
        event.preventDefault();
    }
});

// ─── 4. INIT MAP (ENTRY POINT) ──────────────────────────────────────────────
function initMap() {
    console.log('[initMap] Google Maps API ready.');
    if (!document.getElementById('map')) return;

    try {
        // Pricing config fetch removed — price authority is POST /pricing/preview only
        var mapSettings = window.APP_MAP.getServiceMapSettings('RIDE');

        map = new google.maps.Map(document.getElementById('map'), {
            center: mapSettings.center, zoom: mapSettings.zoom, disableDefaultUI: true, clickableIcons: false
        });
        window.APP.map = map;

        ds = new google.maps.DirectionsService();
        dr = new google.maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: '#4285F4', strokeWeight: 5 } });
        dr.setMap(map);
        window.APP.directionsRenderer = dr;

        geocoder = new google.maps.Geocoder();

        setTimeout(function () { window.APP_MAP.initAutocomplete(); }, 500);
        window.APP_MAP.checkHistory();

        if (window.setService) window.setService('RIDE', document.querySelector('.tab'));
        else if (window.APP && window.APP.setService) window.APP.setService('RIDE', document.querySelector('.tab'));
        else setTimeout(function () { if (window.setService) window.setService('RIDE', document.querySelector('.tab')); }, 500);

    } catch (err) {
        console.error('[initMap] CRITICAL: Map execution failed.', err);
    }
}

window.initMap = initMap;
