// ========================
// map.js - The Maps Cables
// ========================

// --- Shared APP state (kept in window for cross-file access) ---
window.APP = {
    service: 'RIDE',
    config: { RIDE: null, FOOD_MART: null, SEND: null, CAR: null },
    places: { origin: null, dest: null },
    calc: { distance: 0, price: 0 },
    map: null,
    pickerMap: null,
    directionsRenderer: null,
    markers: { origin: null, dest: null },
    historyData: null,
    carOptions: { seats: 4, toll: false },
    picker: {
        activeField: null,
        currentLocation: null,
        locked: false,
        geocodeRequest: null
    }
};

// Central location state
window.locationState = {
    pickup:  { lat: null, lng: null, source: null, address: '' },
    dropoff: { lat: null, lng: null, source: null, address: '' }
};

// --- Helpers ---
function getServiceMapSettings(service) {
    var centerSalatiga = { lat: -7.3305, lng: 110.5084 };
    return {
        center: centerSalatiga,
        zoom: service === 'CAR' ? 10 : 13
    };
}
window.getServiceMapSettings = getServiceMapSettings;

function cleanAddress(address) {
    if (!address) return '';
    return address.replace(/^[A-Z0-9\+]{4,8}(\+[A-Z0-9]{2,})?,\s*/, '');
}

function updateLocationState(field, lat, lng, source, address) {
    window.locationState[field] = { lat: lat, lng: lng, source: source, address: address };
    // Also sync to STATE in app.js
    if (window.STATE) {
        window.STATE[field] = { lat: lat, lng: lng, address: address };
    }
    var placeType = field === 'pickup' ? 'origin' : 'dest';
    window.APP.places[placeType] = {
        geometry: { location: new google.maps.LatLng(lat, lng) },
        formatted_address: address
    };
}

// --- initMap: Called by Google Maps callback ---
window.initMap = function() {
    var mapSettings = getServiceMapSettings(window.APP.service);

    window.APP.map = new google.maps.Map(document.getElementById('map'), {
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

    window.APP.directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
            strokeColor: '#4285F4',
            strokeWeight: 5,
            strokeOpacity: 0.8
        }
    });
    window.APP.directionsRenderer.setMap(window.APP.map);

    initAutocomplete();
    checkHistory();

    // Init note auto-resize
    var noteInput = document.getElementById('note');
    if (noteInput) {
        noteInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '';
        });
    }

    // Start with RIDE tab
    setService('RIDE', document.querySelector('.tab'));
};

// --- Autocomplete ---
function initAutocomplete() {
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
    var acDest   = new google.maps.places.Autocomplete(document.getElementById('destination'), options);

    acOrigin.bindTo('bounds', window.APP.map);
    acDest.bindTo('bounds', window.APP.map);

    acOrigin.addListener('place_changed', function() { handlePlaceSelect('origin', acOrigin); });
    acDest.addListener('place_changed',   function() { handlePlaceSelect('dest', acDest);   });
}

function handlePlaceSelect(type, ac) {
    if (window.APP.picker.locked) return;

    var place = ac.getPlace();
    if (!place.geometry) return;

    var inputId = type === 'origin' ? 'origin' : 'destination';
    var cleaned = cleanAddress(place.formatted_address);
    document.getElementById(inputId).value = cleaned;
    toggleClearBtn(inputId);

    var field = type === 'origin' ? 'pickup' : 'dropoff';
    var lat = place.geometry.location.lat();
    var lng = place.geometry.location.lng();

    updateLocationState(field, lat, lng, 'autocomplete', cleaned);
    updateMarker(type, lat, lng);
    calculateRoute();
}

// --- Markers ---
function updateMarker(type, lat, lng) {
    var map     = window.APP.map;
    var markers = window.APP.markers;

    var iconUrl = type === 'origin'
        ? 'https://cdn-icons-png.flaticon.com/512/684/684908.png'
        : 'https://cdn-icons-png.flaticon.com/512/684/684913.png';

    if (markers[type]) markers[type].setMap(null);

    markers[type] = new google.maps.Marker({
        position: { lat: lat, lng: lng },
        map: map,
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
}
window.updateMarker = updateMarker;

// --- Expand map ---
window.expandMap = function() {
    document.getElementById('map-container').classList.add('expanded');
};

// --- History ---
function checkHistory() {
    var stored = localStorage.getItem('bantujeg_history');
    if (!stored) return;
    try {
        var data = JSON.parse(stored);
        if (data && data.origin_addr && data.dest_addr) {
            window.APP.historyData = data;
            document.getElementById('history-text').innerText =
                '🕒 Pakai Rute Terakhir: ' + cleanAddress(data.origin_addr) + ' → ' + cleanAddress(data.dest_addr);
            document.getElementById('history-chip').style.display = 'flex';
        }
    } catch(e) { console.error(e); }
}

window.useHistory = function() {
    var data = window.APP.historyData;
    if (!data) return;

    document.getElementById('history-chip').style.display = 'none';
    document.getElementById('origin').value      = data.origin_addr;
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

    updateMarker('origin', data.origin_lat, data.origin_lng);
    updateMarker('dest', data.dest_lat, data.dest_lng);
    expandMap();
    calculateRoute();
    toggleClearBtn('origin');
    toggleClearBtn('destination');
};

// --- Input helpers ---
window.setActiveField = function(field) {
    window.locationState.activeField = field;
};

window.toggleClearBtn = function(id) {
    var input = document.getElementById(id);
    var btn   = document.getElementById('clear-' + id);
    if (!input || !btn) return;
    btn.style.display = input.value.length > 0 ? 'flex' : 'none';
};

window.clearInput = function(id) {
    var input = document.getElementById(id);
    input.value = '';
    toggleClearBtn(id);

    if (id === 'origin' || id === 'destination') {
        var type  = id === 'origin' ? 'origin' : 'dest';
        var field = id === 'origin' ? 'pickup' : 'dropoff';

        window.APP.places[type] = null;
        window.locationState[field] = { lat: null, lng: null, source: null, address: '' };
        if (window.STATE) window.STATE[field] = { lat: null, lng: null, address: '' };

        if (window.APP.markers[type]) {
            window.APP.markers[type].setMap(null);
            window.APP.markers[type] = null;
        }

        window.APP.calc.price = 0;
        document.getElementById('price-card').style.display = 'none';
        document.getElementById('error-card').style.display = 'none';
        window.APP.picker.geocodeRequest = null;

        updateLink();
    }
};

window.handleInput = function(id) {
    toggleClearBtn(id);
    var val = document.getElementById(id).value;
    if (val.trim() === '' && (id === 'origin' || id === 'destination')) {
        var type  = id === 'origin' ? 'origin' : 'dest';
        var field = id === 'origin' ? 'pickup' : 'dropoff';

        window.APP.places[type] = null;
        window.locationState[field] = { lat: null, lng: null, source: null, address: '' };
        if (window.STATE) window.STATE[field] = { lat: null, lng: null, address: '' };

        if (window.APP.markers[type]) {
            window.APP.markers[type].setMap(null);
            window.APP.markers[type] = null;
        }

        window.APP.calc.price = 0;
        document.getElementById('price-card').style.display = 'none';
        updateLink();
    }
};

window.addNote = function(text) {
    var noteInput = document.getElementById('note');
    noteInput.value = noteInput.value.length > 0 ? noteInput.value + ', ' + text : text;
    noteInput.style.height = 'auto';
    noteInput.style.height = (noteInput.scrollHeight) + 'px';
    updateLink();
    toggleClearBtn('note');
};

// --- GPS ---
window.getCurrentLocation = function(inputType) {
    if (window.APP.picker.locked) return;
    if (!navigator.geolocation) { alert('Browser tidak support GPS'); return; }

    var btnEl = document.getElementById('gps-' + inputType);
    var original = btnEl.innerHTML;
    btnEl.innerHTML = '⏳ Tunggu...';

    var field = inputType === 'origin' ? 'pickup' : 'dropoff';
    var existing = window.locationState[field];

    if (existing.source === 'manual' && existing.lat) {
        btnEl.innerHTML = original;
        alert('Lokasi sudah diatur manual. Hapus dulu untuk gunakan GPS.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;
            var geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
                btnEl.innerHTML = original;
                if (status === 'OK' && results[0]) {
                    var cleaned = cleanAddress(results[0].formatted_address);
                    var type = inputType === 'origin' ? 'origin' : 'dest';
                    document.getElementById(inputType).value = cleaned;
                    toggleClearBtn(inputType);
                    updateLocationState(field, lat, lng, 'gps', cleaned);
                    updateMarker(type, lat, lng);
                    expandMap();
                    if (window.APP.places.origin && window.APP.places.dest) calculateRoute();
                } else {
                    alert('Gagal mendeteksi nama jalan.');
                }
            });
        },
        function() {
            btnEl.innerHTML = original;
            alert('Gagal ambil lokasi. Pastikan GPS nyala!');
        }
    );
};

// --- Car options ---
window.handleCarOptionChange = function() {
    var selected = document.querySelector('input[name="car-seat"]:checked');
    window.APP.carOptions.seats = selected ? parseInt(selected.value, 10) : 4;
    window.APP.carOptions.toll  = document.getElementById('car-toll').checked;

    if (window.APP.places.origin && window.APP.places.dest) calculateRoute();
    else if (window.APP.calc.distance > 0) calculatePrice(window.APP.calc.distance);
    else updateLink();
};

// --- Route calculation ---
function calculateRoute() {
    var origin = window.APP.places.origin;
    var dest   = window.APP.places.dest;
    if (!origin || !dest) return;

    var SALATIGA = { lat: -7.3305, lng: 110.5084 };
    var distFromBase = google.maps.geometry.spherical.computeDistanceBetween(
        origin.geometry.location,
        new google.maps.LatLng(SALATIGA.lat, SALATIGA.lng)
    ) / 1000;

    if (distFromBase > 15) {
        showError('Mohon maaf Kak, saat ini armada kami hanya melayani penjemputan di area Salatiga & Sekitarnya. 🙏');
        return;
    }

    setLoading(true);
    document.getElementById('error-card').style.display = 'none';

    var serviceKey   = window.APP.service;
    var config       = window.APP.config[serviceKey];
    var defaultLimit = serviceKey === 'CAR' ? 150 : 30;
    var maxDistance  = config ? (config.max_distance_km || defaultLimit) : defaultLimit;
    var isCar        = serviceKey === 'CAR';
    var travelMode   = isCar ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.TWO_WHEELER;

    var directionsService = new google.maps.DirectionsService();
    directionsService.route({
        origin: origin.geometry.location,
        destination: dest.geometry.location,
        travelMode: travelMode,
        avoidTolls: !window.APP.carOptions.toll
    }, function(result, status) {
        setLoading(false);

        if (status !== google.maps.DirectionsStatus.OK) {
            showError('Waduh, rute tidak ditemukan. Coba geser titiknya dikit ya Kak! 🗺️');
            window.APP.calc.price = 0;
            document.getElementById('price-card').style.display = 'none';
            updateLink();
            return;
        }

        window.APP.directionsRenderer.setDirections(result);
        if (result.routes[0] && result.routes[0].bounds) {
            window.APP.map.fitBounds(result.routes[0].bounds, { padding: 60 });
        }

        var leg = result.routes[0].legs[0];
        var distanceKm  = leg.distance.value / 1000;
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
            showError('Maaf Kak, jarak pengantaran melebihi batas operasional kami (' + maxDistance + 'km). 🙏');
            window.APP.calc.price = 0;
        } else {
            calculatePrice(finalKm);
        }

        document.getElementById('price-card').style.display = 'flex';
        updateLink();
    });
}

function calculatePrice(distance) {
    var service = window.APP.service;
    var config  = window.APP.config[service];

    if (!config) {
        // No backend pricing config loaded - show fallback
        showError('Gagal mengambil data harga server. Refresh halaman.');
        return;
    }

    var price = 0;
    var tiers = config.pricing_model && config.pricing_model.tiers
        ? config.pricing_model.tiers
        : config.TIERS;

    if (Array.isArray(tiers)) {
        var tier = tiers.find(function(t) { return distance >= t.min_km && distance < t.max_km; })
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
    document.getElementById('fake-price').innerText  = 'Rp ' + fakePrice.toLocaleString('id-ID');
    document.getElementById('price-display').innerText = 'Rp ' + price.toLocaleString('id-ID');
    document.getElementById('dist-display').innerText  = distance.toFixed(1) + ' km';
    document.getElementById('price-card').style.display = 'flex';

    updateLink();
}

function showError(msg) {
    var errCard  = document.getElementById('error-card');
    var priceCard = document.getElementById('price-card');
    var btn      = document.getElementById('btn-submit');
    var btnText  = document.getElementById('btn-text');

    errCard.style.display  = 'block';
    errCard.innerText      = '✋ ' + msg;
    priceCard.style.display = 'none';
    btn.classList.add('disabled');
    btnText.innerText = 'Jarak Terlalu Jauh';
    window.APP.calc.price = 0;
}

function setLoading(state) {
    var spin = document.getElementById('loading-spin');
    var txt  = document.getElementById('btn-text');
    if (state) {
        spin.style.display = 'block';
        txt.style.display  = 'none';
    } else {
        spin.style.display = 'none';
        txt.style.display  = 'block';
    }
}

// --- Map Picker Modal ---
window.openMapPicker = function(type) {
    window.APP.picker.locked = true;
    window.APP.picker.activeField = type === 'origin' ? 'pickup' : 'dropoff';

    var modal = document.getElementById('map-picker-modal');
    modal.classList.add('active');

    document.getElementById('picker-title').innerText =
        type === 'origin' ? 'Tentukan Titik Jemput' : 'Tentukan Tujuan';
    document.getElementById('pin-label').innerText =
        type === 'origin' ? 'Lokasi Jemput' : 'Lokasi Tujuan';
    document.getElementById('picker-address').innerText = 'Geser peta untuk memilih lokasi...';

    if (!window.APP.pickerMap) {
        var mapSettings = getServiceMapSettings(window.APP.service);
        window.APP.pickerMap = new google.maps.Map(document.getElementById('picker-map'), {
            center: mapSettings.center,
            zoom: mapSettings.zoom + 4,
            gestureHandling: 'greedy',
            disableDefaultUI: true,
            clickableIcons: false,
            zoomControl: true
        });

        window.APP.pickerMap.addListener('idle', function() {
            var center = window.APP.pickerMap.getCenter();
            window.APP.picker.currentLocation = { lat: center.lat(), lng: center.lng() };
        });
    }

    setTimeout(function() {
        google.maps.event.trigger(window.APP.pickerMap, 'resize');

        var field = type === 'origin' ? 'origin' : 'dest';
        var existingPlace = window.APP.places[field];
        var mapSettings = getServiceMapSettings(window.APP.service);

        if (existingPlace && existingPlace.geometry) {
            var lat = existingPlace.geometry.location.lat();
            var lng = existingPlace.geometry.location.lng();
            window.APP.picker.currentLocation = { lat: lat, lng: lng };
            window.APP.pickerMap.setCenter({ lat: lat, lng: lng });
            window.APP.pickerMap.setZoom(18);
        } else if (navigator.geolocation) {
            window.APP.picker.currentLocation = mapSettings.center;
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    var lat = pos.coords.latitude;
                    var lng = pos.coords.longitude;
                    window.APP.picker.currentLocation = { lat: lat, lng: lng };
                    window.APP.pickerMap.setCenter({ lat: lat, lng: lng });
                    window.APP.pickerMap.setZoom(18);
                },
                function() {
                    window.APP.pickerMap.setCenter(mapSettings.center);
                    window.APP.pickerMap.setZoom(mapSettings.zoom + 4);
                }
            );
        } else {
            window.APP.picker.currentLocation = mapSettings.center;
            window.APP.pickerMap.setCenter(mapSettings.center);
            window.APP.pickerMap.setZoom(mapSettings.zoom + 4);
        }
    }, 300);

    history.pushState({ mapPicker: true }, '', '');
};

window.closeMapPicker = function() {
    var modal = document.getElementById('map-picker-modal');
    modal.classList.remove('active');
    window.APP.picker.locked = false;
    window.APP.picker.activeField = null;

    if (history.state && history.state.mapPicker) {
        history.back();
    }
};

window.confirmLocation = function() {
    var activeField = window.APP.picker.activeField;
    var loc = window.APP.picker.currentLocation;
    if (!activeField || !loc) return;

    var lat = loc.lat;
    var lng = loc.lng;
    var inputId = activeField === 'pickup' ? 'origin' : 'destination';

    var confirmBtn    = document.getElementById('confirm-btn');
    var addressDisplay = document.getElementById('picker-address');
    confirmBtn.disabled = true;
    addressDisplay.innerText = 'Mencari alamat...';

    var geocoder = new google.maps.Geocoder();
    var requestId = Date.now();
    window.APP.picker.geocodeRequest = requestId;

    geocoder.geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
        if (window.APP.picker.geocodeRequest !== requestId) return;

        confirmBtn.disabled = false;

        if (status !== 'OK' || !results[0]) {
            addressDisplay.innerText = 'Gagal mendapatkan alamat. Coba lagi.';
            return;
        }

        var address = cleanAddress(results[0].formatted_address);
        document.getElementById(inputId).value = address;
        toggleClearBtn(inputId);

        updateLocationState(activeField, lat, lng, 'manual', address);

        var markerType = activeField === 'pickup' ? 'origin' : 'dest';
        updateMarker(markerType, lat, lng);
        expandMap();

        if (window.APP.places.origin && window.APP.places.dest) calculateRoute();

        closeMapPicker();
    });
};

window.addEventListener('popstate', function(event) {
    var modal = document.getElementById('map-picker-modal');
    if (modal.classList.contains('active')) {
        closeMapPicker();
        event.preventDefault();
    }
});
