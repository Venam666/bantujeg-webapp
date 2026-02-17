
// CONSTANTS
const BACKEND_URL = "http://localhost:3000";

// GLOBAL STATE
let STATE = {
    token: null,
    phone: null,
    service: 'RIDE',
    pickup: { lat: null, lng: null, address: '' },
    dropoff: { lat: null, lng: null, address: '' }
};

// UI ELEMENTS
const overlay = document.getElementById('overlay');
const viewLogin = document.getElementById('view-login');
const viewMain = document.getElementById('view-main');

// MAPS OBJECTS
let map;
let directionsService;
let directionsRenderer;

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', async () => {
    // Check URL for token (from Magic Link)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
        // Verify Token
        showOverlay(true);
        try {
            const response = await fetch(`${BACKEND_URL}/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: urlToken })
            });

            const data = await response.json();

            if (response.ok && data.sessionToken) {
                // Success: Save session
                localStorage.setItem('sessionToken', data.sessionToken);
                localStorage.setItem('customerPhone', data.customer?.phone || '');

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);

                // Reload to clean state
                window.location.reload();
            } else {
                alert("Login Failed: " + (data.message || "Invalid Token"));
                showOverlay(false);
            }
        } catch (e) {
            alert("Network Error during Login");
            showOverlay(false);
        }
    } else {
        // Check LocalStorage
        const storedToken = localStorage.getItem('sessionToken');
        if (storedToken) {
            STATE.token = storedToken;
            STATE.phone = localStorage.getItem('customerPhone');
            showMainView();
        } else {
            showLoginView();
        }
    }
});

// --- GOOGLE MAPS ---

window.initMap = function () {
    // Default: Salatiga
    const salatiga = { lat: -7.3305, lng: 110.5084 };

    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 14,
        center: salatiga,
        disableDefaultUI: true,
        zoomControl: true,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false
    });

    initAutocomplete();
};

function initAutocomplete() {
    const inputPickup = document.getElementById("input-pickup");
    const inputDropoff = document.getElementById("input-dropoff");

    // Pickup
    const autocompletePickup = new google.maps.places.Autocomplete(inputPickup);
    autocompletePickup.bindTo("bounds", map);
    autocompletePickup.addListener("place_changed", () => {
        const place = autocompletePickup.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        STATE.pickup.lat = place.geometry.location.lat();
        STATE.pickup.lng = place.geometry.location.lng();
        STATE.pickup.address = place.formatted_address;

        // Determine "Origin" logic if needed, or just update map bounds
        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(17);
        }

        drawRoute();
    });

    // Dropoff
    const autocompleteDropoff = new google.maps.places.Autocomplete(inputDropoff);
    autocompleteDropoff.bindTo("bounds", map);
    autocompleteDropoff.addListener("place_changed", () => {
        const place = autocompleteDropoff.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        STATE.dropoff.lat = place.geometry.location.lat();
        STATE.dropoff.lng = place.geometry.location.lng();
        STATE.dropoff.address = place.formatted_address;

        drawRoute();
    });
}

function drawRoute() {
    if (STATE.pickup.lat && STATE.dropoff.lat) {
        const origin = { lat: STATE.pickup.lat, lng: STATE.pickup.lng };
        const destination = { lat: STATE.dropoff.lat, lng: STATE.dropoff.lng };

        directionsService.route({
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING
        }, (response, status) => {
            if (status === "OK") {
                directionsRenderer.setDirections(response);
            } else {
                console.warn("Directions request failed due to " + status);
            }
        });
    }
}


// --- VIEW LOGIC ---

function showOverlay(show) {
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

function showLoginView() {
    viewLogin.classList.remove('hidden');
    viewMain.classList.add('hidden');
}

function showMainView() {
    viewLogin.classList.add('hidden');
    viewMain.classList.remove('hidden');
    // Resize map trigger because it was hidden
    setTimeout(() => {
        if (map) google.maps.event.trigger(map, "resize");
    }, 100);
}


// --- BUSINESS LOGIC ---

window.requestLogin = async function () {
    const phoneInput = document.getElementById('login-phone').value;
    if (!phoneInput) return alert("Please enter WhatsApp number");

    showOverlay(true);
    try {
        const res = await fetch(`${BACKEND_URL}/auth/request-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneInput })
        });
        const data = await res.json();

        if (res.ok) {
            alert("Login Link Sent! Check your WhatsApp.");
        } else {
            alert("Error: " + (data.message || "Failed to send link"));
        }
    } catch (e) {
        alert("Network Error");
    } finally {
        showOverlay(false);
    }
};

window.setService = function (serviceName) {
    STATE.service = serviceName;
    // Update UI buttons
    document.querySelectorAll('.service-tab').forEach(btn => {
        if (btn.id === `btn-${serviceName}`) {
            btn.classList.remove('bg-gray-100', 'text-gray-600');
            btn.classList.add('bg-blue-600', 'text-white', 'shadow');
        } else {
            btn.classList.add('bg-gray-100', 'text-gray-600');
            btn.classList.remove('bg-blue-600', 'text-white', 'shadow');
        }
    });
};

window.submitOrder = async function () {
    if (!STATE.pickup.lat || !STATE.dropoff.lat) {
        return alert("Please select Pickup and Dropoff locations from the suggestions.");
    }

    const noteText = document.getElementById('input-note').value;
    const selectedPaymentMethod = document.getElementById('input-payment').value;

    const payload = {
        service: STATE.service,
        customer_phone: STATE.phone, // Might be null if not returned by verify, but localstorage has it
        session_key: STATE.token,
        pickupLocation: { lat: STATE.pickup.lat, lng: STATE.pickup.lng },
        dropoffLocation: { lat: STATE.dropoff.lat, lng: STATE.dropoff.lng },
        origin: STATE.pickup.address,
        destination: STATE.dropoff.address,
        paymentMethod: selectedPaymentMethod,
        note: noteText
    };

    const endpoint = selectedPaymentMethod === 'QRIS' ? '/orders/qris' : '/orders/create';

    showOverlay(true);
    try {
        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${STATE.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            alert("ORDER SUCCESS! ID: " + (data.orderId || "OK"));
            // Optional: clear form logic here
        } else {
            alert("Order Failed: " + (data.message || "Unknown error"));
        }
    } catch (e) {
        alert("Network Error during Order");
    } finally {
        showOverlay(false);
    }
};
