/* ========================
   map.js - The Maps Cables
   ======================== */

// 1. Prevent Early Access: Declare Variables
let map, ds, dr; // Global map instances
let pickerMap;   // Picker map instance
let geocoder;    // Geocoder service (lazy init)

// 2. Define Map Namespace
window.APP_MAP = {

    // --- Shared Helpers ---
    getServiceMapSettings: function (service) {
        var centerSalatiga = { lat: -7.3305, lng: 110.5084 };
        return {
            center: centerSalatiga,
            zoom: service === 'CAR' ? 10 : 13
        };
    },

    cleanAddress: function (address) {
        if (!address) return '';
        return address.replace(/^[A-Z0-9\+]{4,8}(\+[A-Z0-9]{2,})?,\s*/, '');
    },

    updateLocationState: function (field, lat, lng, source, address) {
        // Update APP state
        if (window.APP && window.APP.state) {
            window.APP.state[field] = { lat: lat, lng: lng, source: source, address: address };
        }

        var placeType = field === 'pickup' ? 'origin' : 'dest';
        window.APP.places[placeType] = {
            geometry: { location: new google.maps.LatLng(lat, lng) },
            formatted_address: address
        };
    },

    // --- Autocomplete ---
    initAutocomplete: function () {
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

        var acOrigin = new google.maps.places.Autocomplete(document.getElementById('origin'), options);
        var acDest = new google.maps.places.Autocomplete(document.getElementById('destination'), options);

        if (map) {
            acOrigin.bindTo('bounds', map);
            acDest.bindTo('bounds', map);
        }

        acOrigin.addListener('place_changed', function () { window.APP_MAP.handlePlaceSelect('origin', acOrigin); });
        acDest.addListener('place_changed', function () { window.APP_MAP.handlePlaceSelect('dest', acDest); });
    },

    handlePlaceSelect: function (type, ac) {
        if (window.APP.picker.locked) return;

        var place = ac.getPlace();
        if (!place.geometry) return;

        var inputId = type === 'origin' ? 'origin' : 'destination';
        var cleaned = window.APP_MAP.cleanAddress(place.formatted_address);
        document.getElementById(inputId).value = cleaned;
        window.toggleClearBtn(inputId);

        var field = type === 'origin' ? 'pickup' : 'dropoff';
        var lat = place.geometry.location.lat();
        var lng = place.geometry.location.lng();

        window.APP_MAP.updateLocationState(field, lat, lng, 'autocomplete', cleaned);
        window.APP_MAP.updateMarker(type, lat, lng);
        window.APP_MAP.drawRoute();
    },

    // --- Markers ---
    updateMarker: function (type, lat, lng) {
        var markers = window.APP.markers;

        var iconUrl = type === 'origin'
            ? 'https://cdn-icons-png.flaticon.com/512/684/684908.png'
            : 'https://cdn-icons-png.flaticon.com/512/684/684913.png';

        if (markers[type]) markers[type].setMap(null);

        markers[type] = new google.maps.Marker({
            position: { lat: lat, lng: lng },
            map: map, // Use the local 'map' variable
            icon: { url: iconUrl, scaledSize: new google.maps.Size(40, 40) },
            label: {
                text: type === 'origin' ? 'Jemput' : 'Tujuan',
                color: 'black',
                fontWeight: 'bold',
                fontSize: '12px'
            }
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

    // --- History ---
    checkHistory: function () {
        var stored = localStorage.getItem('bantujeg_history');
        if (!stored) return;
        try {
            var data = JSON.parse(stored);
            if (data && data.origin_addr && data.dest_addr) {
                window.APP.historyData = data;
                document.getElementById('history-text').innerText =
                    '🕒 Pakai Rute Terakhir: ' + window.APP_MAP.cleanAddress(data.origin_addr) + ' → ' + window.APP_MAP.cleanAddress(data.dest_addr);
                document.getElementById('history-chip').style.display = 'flex';
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

    // --- Route calculation ---
    drawRoute: function () {
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
        var config = window.APP.config[serviceKey];
        var defaultLimit = serviceKey === 'CAR' ? 150 : 30;
        var maxDistance = config ? (config.max_distance_km || defaultLimit) : defaultLimit;
        var isCar = serviceKey === 'CAR';
        var travelMode = isCar ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.TWO_WHEELER;

        if (!ds) ds = new google.maps.DirectionsService(); // Ensure ds exists

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

            dr.setDirections(result); // Using local 'dr'
            if (result.routes[0] && result.routes[0].bounds) {
                map.fitBounds(result.routes[0].bounds, { padding: 60 });
            }

            var leg = result.routes[0].legs[0];
            var distanceKm = leg.distance.value / 1000;
            var durationMins = Math.ceil(leg.duration.value / 60);

            var finalKm = distanceKm;
            if (!isCar) {
                var straightKm = google.maps.geometry.spherical.computeDistanceBetween(
                    leg.start_location,
                    leg.end_location
                ) / 1000;
                var configService = window.APP.config[serviceKey] || window.APP.config.RIDE || {};
                var logic = configService.distance_logic || { lmf: 1.25, detour_limit: 1.15 };
                var motorEstimate = straightKm * logic.lmf;
                if (distanceKm > motorEstimate * logic.detour_limit) finalKm = motorEstimate;
                else if (distanceKm < straightKm * 1.05) finalKm = straightKm * 1.10;
            }

            window.APP.calc = {
                distance: parseFloat(finalKm.toFixed(2)),
                duration: durationMins
            };

            document.getElementById('dist-display').innerText =
                window.APP.calc.distance.toFixed(1) + ' km (' + durationMins + ' mnt)';

            if (window.APP.calc.distance > maxDistance) {
                window.APP_MAP.showError('Maaf Kak, jarak pengantaran melebihi batas operasional kami (' + maxDistance + 'km). 🙏');
                window.APP.calc.price = 0;
            } else {
                window.APP_MAP.calculatePrice(finalKm);
            }

            document.getElementById('price-card').style.display = 'flex';
            window.updateLink();
        });
    },

    calculatePrice: function (distance) {
        var service = window.APP.service;
        var config = window.APP.config[service];

        if (!config) {
            // No backend pricing config loaded - show fallback
            window.APP_MAP.showError('Gagal mengambil data harga server. Refresh halaman.');
            return;
        }

        var price = 0;
        var tiers = config.pricing_model && config.pricing_model.tiers
            ? config.pricing_model.tiers
            : config.TIERS;

        if (Array.isArray(tiers)) {
            var tier = tiers.find(function (t) { return distance >= t.min_km && distance < t.max_km; })
                || tiers[tiers.length - 1];
            if (tier.calculation_type === 'FLAT') price = tier.base_price;
            else price = tier.base_price + ((distance - tier.offset_km) * tier.price_per_km);
        } else if (tiers && tiers.BASE) {
            var baseLimit = tiers.BASE.max_distance_km || 2;
            if (distance <= baseLimit) price = tiers.BASE.delivery_fee;
            else price = tiers.MID.base_fee + ((distance - baseLimit) * tiers.MID.price_per_km);
        }

        if (service === 'CAR' && window.APP.carOptions.seats === 6) price *= 1.3;

        price = Math.ceil(price / 500) * 500;
        window.APP.calc.price = price;

        var fakePrice = Math.ceil((price * 1.10) / 500) * 500;
        document.getElementById('fake-price').innerText = 'Rp ' + fakePrice.toLocaleString('id-ID');
        document.getElementById('price-display').innerText = 'Rp ' + price.toLocaleString('id-ID');
        document.getElementById('dist-display').innerText = distance.toFixed(1) + ' km';
        document.getElementById('price-card').style.display = 'flex';

        window.updateLink();
    },

    showError: function (msg) {
        var errCard = document.getElementById('error-card');
        var priceCard = document.getElementById('price-card');
        var btn = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');

        errCard.style.display = 'block';
        errCard.innerText = '✋ ' + msg;
        priceCard.style.display = 'none';
        btn.classList.add('disabled');
        btnText.innerText = 'Jarak Terlalu Jauh';
        window.APP.calc.price = 0;
    },

    setLoading: function (state) {
        var spin = document.getElementById('loading-spin');
        var txt = document.getElementById('btn-text');
        if (state) {
            spin.style.display = 'block';
            txt.style.display = 'none';
        } else {
            spin.style.display = 'none';
            txt.style.display = 'block';
        }
    },

    // --- Map Picker Modal ---
    openMapPicker: function (type) {
        window.APP.picker.locked = true;
        window.APP.picker.activeField = type === 'origin' ? 'pickup' : 'dropoff';

        var modal = document.getElementById('map-picker-modal');
        modal.classList.add('active');

        document.getElementById('picker-title').innerText =
            type === 'origin' ? 'Tentukan Titik Jemput' : 'Tentukan Tujuan';
        document.getElementById('pin-label').innerText =
            type === 'origin' ? 'Lokasi Jemput' : 'Lokasi Tujuan';
        document.getElementById('picker-address').innerText = 'Geser peta untuk memilih lokasi...';

        // Fix: Use setTimeout to ensure DOM is ready
        setTimeout(function () {
            if (!pickerMap) {
                var mapSettings = window.APP_MAP.getServiceMapSettings(window.APP.service);
                pickerMap = new google.maps.Map(document.getElementById('picker-map'), {
                    center: mapSettings.center,
                    zoom: mapSettings.zoom + 4,
                    gestureHandling: 'greedy',
                    disableDefaultUI: true,
                    clickableIcons: false,
                    zoomControl: true
                });

                // Assign to global APP if legacy needs it
                window.APP.pickerMap = pickerMap;

                pickerMap.addListener('idle', function () {
                    var center = pickerMap.getCenter();
                    window.APP.picker.currentLocation = { lat: center.lat(), lng: center.lng() };
                });
            }

            google.maps.event.trigger(pickerMap, 'resize');

            var field = type === 'origin' ? 'origin' : 'dest';
            var existingPlace = window.APP.places[field];
            var mapSettings = window.APP_MAP.getServiceMapSettings(window.APP.service);

            if (existingPlace && existingPlace.geometry) {
                var lat = existingPlace.geometry.location.lat();
                var lng = existingPlace.geometry.location.lng();
                window.APP.picker.currentLocation = { lat: lat, lng: lng };
                pickerMap.setCenter({ lat: lat, lng: lng });
                pickerMap.setZoom(18);
            } else if (navigator.geolocation) {
                // Try current location
                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        var lat = pos.coords.latitude;
                        var lng = pos.coords.longitude;
                        window.APP.picker.currentLocation = { lat: lat, lng: lng };
                        pickerMap.setCenter({ lat: lat, lng: lng });
                        pickerMap.setZoom(18);
                    },
                    function () {
                        // Fallback
                        window.APP.picker.currentLocation = mapSettings.center;
                        pickerMap.setCenter(mapSettings.center);
                        pickerMap.setZoom(mapSettings.zoom + 4);
                    }
                );
            } else {
                window.APP.picker.currentLocation = mapSettings.center;
                pickerMap.setCenter(mapSettings.center);
                pickerMap.setZoom(mapSettings.zoom + 4);
            }
        }, 100); // 100ms Delay

        history.pushState({ mapPicker: true }, '', '');
    },

    closeMapPicker: function () {
        var modal = document.getElementById('map-picker-modal');
        modal.classList.remove('active');
        window.APP.picker.locked = false;
        window.APP.picker.activeField = null;

        if (history.state && history.state.mapPicker) {
            history.back();
        }
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
        confirmBtn.disabled = true;
        addressDisplay.innerText = 'Mencari alamat...';

        if (!geocoder) geocoder = new google.maps.Geocoder();
        var requestId = Date.now();
        window.APP.picker.geocodeRequest = requestId;

        geocoder.geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
            if (window.APP.picker.geocodeRequest !== requestId) return;

            confirmBtn.disabled = false;

            if (status !== 'OK' || !results[0]) {
                addressDisplay.innerText = 'Gagal mendapatkan alamat. Coba lagi.';
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

    // --- GPS ---
    getCurrentLocation: function (inputType) {
        if (window.APP.picker.locked) return;
        if (!navigator.geolocation) { alert('Browser tidak support GPS'); return; }

        var btnEl = document.getElementById('gps-' + inputType);
        var original = btnEl.innerHTML;
        btnEl.innerHTML = '⏳ Tunggu...';

        var field = inputType === 'origin' ? 'pickup' : 'dropoff';
        var existing = window.APP.state[field]; // Use APP.state

        if (existing.source === 'manual' && existing.lat) {
            btnEl.innerHTML = original;
            alert('Lokasi sudah diatur manual. Hapus dulu untuk gunakan GPS.');
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
                        alert('Gagal mendeteksi nama jalan.');
                    }
                });
            },
            function () {
                btnEl.innerHTML = original;
                alert('Gagal ambil lokasi. Pastikan GPS nyala!');
            }
        );
    }
};

// 3. Export Global Helpers 
window.useHistory = window.APP_MAP.useHistory;
window.openMapPicker = window.APP_MAP.openMapPicker;
window.closeMapPicker = window.APP_MAP.closeMapPicker;
window.confirmLocation = window.APP_MAP.confirmLocation;
window.getCurrentLocation = window.APP_MAP.getCurrentLocation;
window.getServiceMapSettings = window.APP_MAP.getServiceMapSettings;

// Other simple UI helpers
window.expandMap = function () {
    document.getElementById('map-container').classList.add('expanded');
};

window.setActiveField = function (field) {
    if (window.APP.picker) window.APP.picker.activeField = field;
};

window.toggleClearBtn = function (id) {
    var input = document.getElementById(id);
    var btn = document.getElementById('clear-' + id);
    if (!input || !btn) return;
    btn.style.display = input.value.length > 0 ? 'flex' : 'none';
};

window.clearInput = function (id) {
    var input = document.getElementById(id);
    input.value = '';
    window.toggleClearBtn(id);

    if (id === 'origin' || id === 'destination') {
        var type = id === 'origin' ? 'origin' : 'dest';
        var field = id === 'origin' ? 'pickup' : 'dropoff';

        window.APP.places[type] = null;
        if (window.APP.state) window.APP.state[field] = { lat: null, lng: null, source: null, address: '' };

        if (window.APP.markers[type]) {
            window.APP.markers[type].setMap(null);
            window.APP.markers[type] = null;
        }

        window.APP.calc.price = 0;
        document.getElementById('price-card').style.display = 'none';
        document.getElementById('error-card').style.display = 'none';
        window.APP.picker.geocodeRequest = null;

        window.updateLink();
    }
};

window.handleInput = function (id) {
    window.toggleClearBtn(id);
    var val = document.getElementById(id).value;
    if (val.trim() === '' && (id === 'origin' || id === 'destination')) {
        var type = id === 'origin' ? 'origin' : 'dest';
        var field = id === 'origin' ? 'pickup' : 'dropoff';

        window.APP.places[type] = null;
        if (window.APP.state) window.APP.state[field] = { lat: null, lng: null, source: null, address: '' };

        if (window.APP.markers[type]) {
            window.APP.markers[type].setMap(null);
            window.APP.markers[type] = null;
        }

        window.APP.calc.price = 0;
        document.getElementById('price-card').style.display = 'none';
        window.updateLink();
    }
};

window.addNote = function (text) {
    var noteInput = document.getElementById('note');
    noteInput.value = noteInput.value.length > 0 ? noteInput.value + ', ' + text : text;
    noteInput.style.height = 'auto';
    noteInput.style.height = (noteInput.scrollHeight) + 'px';
    window.updateLink();
    window.toggleClearBtn('note');
};

window.handleCarOptionChange = function () {
    var selected = document.querySelector('input[name="car-seat"]:checked');
    window.APP.carOptions.seats = selected ? parseInt(selected.value, 10) : 4;
    window.APP.carOptions.toll = document.getElementById('car-toll').checked;

    if (window.APP.places.origin && window.APP.places.dest) window.APP_MAP.drawRoute();
    else if (window.APP.calc.distance > 0) window.APP_MAP.calculatePrice(window.APP.calc.distance);
    else window.updateLink();
};

window.addEventListener('popstate', function (event) {
    var modal = document.getElementById('map-picker-modal');
    if (modal.classList.contains('active')) {
        window.APP_MAP.closeMapPicker();
        event.preventDefault();
    }
});

// 4. Strengthen initMap (Called by Google Maps callback)
function initMap() {
    console.log('Initializing Map...');

    // Safety check: ensure map element exists
    if (!document.getElementById('map')) {
        console.warn('Map element not found, skipping init.');
        return;
    }

    try {
        var mapSettings = window.APP_MAP.getServiceMapSettings(window.APP.service);

        // Initialize Map
        map = new google.maps.Map(document.getElementById('map'), {
            center: mapSettings.center,
            zoom: mapSettings.zoom,
            restriction: {
                latLngBounds: { north: -6.5, south: -8.0, west: 109.5, east: 111.5 },
                strictBounds: false
            },
            gestureHandling: 'greedy',
            disableDefaultUI: true,
            clickableIcons: false,
            zoomControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false
        });
        window.APP.map = map; // Export

        // Initialize Directions
        dr = new google.maps.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
                strokeColor: '#4285F4',
                strokeWeight: 5,
                strokeOpacity: 0.8
            }
        });
        window.APP.directionsRenderer = dr; // Export
        dr.setMap(map);

        // Initialize other services (lazy init usually better, but init here ok)
        // Auto-complete (dependent on map bounds)
        window.APP_MAP.initAutocomplete();
        window.APP_MAP.checkHistory();

        // Note resize listener
        var noteInput = document.getElementById('note');
        if (noteInput) {
            noteInput.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
                if (this.value === '') this.style.height = '';
            });
        }

        // CRITICAL FIX: Safe Call setService
        if (window.setService) {
            window.setService('RIDE', document.querySelector('.tab'));
        } else if (window.APP && window.APP.setService) {
            window.APP.setService('RIDE', document.querySelector('.tab'));
        } else {
            // Defer execution if app.js not loaded yet
            console.warn('setService missing, deferring tab init...');
            setTimeout(() => {
                if (window.setService) window.setService('RIDE', document.querySelector('.tab'));
            }, 500);
        }

    } catch (error) {
        console.error('CRITICAL: Map initialization failed.', error);
    }
}

// 5. Explicit Binding
window.initMap = initMap;
