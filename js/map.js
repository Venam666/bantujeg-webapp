// --- GOOGLE MAPS LOGIC ---

/* Global Variables */
window.map = null;
window.directionsService = null;
window.directionsRenderer = null;

window.initMap = function () {
    // Default: Salatiga
    const salatiga = { lat: -7.3305, lng: 110.5084 };

    window.map = new google.maps.Map(document.getElementById("map"), {
        zoom: 14,
        center: salatiga,
        disableDefaultUI: true,
        zoomControl: false,
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    });

    window.directionsService = new google.maps.DirectionsService();
    window.directionsRenderer = new google.maps.DirectionsRenderer({
        map: window.map,
        suppressMarkers: false,
        polylineOptions: {
            strokeColor: '#00AA13', // Gojek Green for route
            strokeWeight: 5
        }
    });

    initAutocomplete();

    // Trigger map resize initially in case it was hidden
    setTimeout(() => {
        google.maps.event.trigger(window.map, "resize");
    }, 500);
};

function initAutocomplete() {
    const inputPickup = document.getElementById("input-pickup");
    const inputDropoff = document.getElementById("input-dropoff");

    if (!inputPickup || !inputDropoff) return; // Guard clause

    // Pickup
    const autocompletePickup = new google.maps.places.Autocomplete(inputPickup);
    autocompletePickup.bindTo("bounds", window.map);
    autocompletePickup.addListener("place_changed", () => {
        const place = autocompletePickup.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        STATE.pickup.lat = place.geometry.location.lat();
        STATE.pickup.lng = place.geometry.location.lng();
        STATE.pickup.address = place.formatted_address;

        // Visual feedback
        if (place.geometry.viewport) {
            window.map.fitBounds(place.geometry.viewport);
        } else {
            window.map.setCenter(place.geometry.location);
            window.map.setZoom(17);
        }

        drawRoute();
    });

    // Dropoff
    const autocompleteDropoff = new google.maps.places.Autocomplete(inputDropoff);
    autocompleteDropoff.bindTo("bounds", window.map);
    autocompleteDropoff.addListener("place_changed", () => {
        const place = autocompleteDropoff.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        STATE.dropoff.lat = place.geometry.location.lat();
        STATE.dropoff.lng = place.geometry.location.lng();
        STATE.dropoff.address = place.formatted_address;

        drawRoute();
    });
}

window.drawRoute = function () {
    if (STATE.pickup.lat && STATE.dropoff.lat) {
        const origin = { lat: STATE.pickup.lat, lng: STATE.pickup.lng };
        const destination = { lat: STATE.dropoff.lat, lng: STATE.dropoff.lng };

        window.directionsService.route({
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING
        }, (response, status) => {
            if (status === "OK") {
                window.directionsRenderer.setDirections(response);

                // Keep map centered nicely
                const bounds = new google.maps.LatLngBounds();
                bounds.extend(origin);
                bounds.extend(destination);
                window.map.fitBounds(bounds);
            } else {
                console.warn("Directions request failed due to " + status);
            }
        });
    }
};
