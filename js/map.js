let map;
let directionsService;
let directionsRenderer;
let geocoder;

export function initMapModule(elementId = 'map') {
  if (!window.google?.maps) return false;

  map = new google.maps.Map(document.getElementById(elementId), {
    center: { lat: -7.3318, lng: 110.4928 },
    zoom: 13,
    disableDefaultUI: true,
    zoomControl: true,
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers: false });
  directionsRenderer.setMap(map);
  geocoder = new google.maps.Geocoder();
  return true;
}

export async function geocodeAddress(address) {
  if (!geocoder) throw new Error('Map not initialized');
  const result = await geocoder.geocode({ address });
  if (!result.results?.length) throw new Error('Alamat tidak ditemukan');
  const loc = result.results[0].geometry.location;
  return { lat: loc.lat(), lng: loc.lng(), formattedAddress: result.results[0].formatted_address };
}

export async function previewRoute(origin, destination, serviceType) {
  if (!directionsService || !directionsRenderer) throw new Error('Map not initialized');

  const travelMode = serviceType === 'CAR' ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.TWO_WHEELER;
  const result = await directionsService.route({
    origin,
    destination,
    travelMode,
  });
  directionsRenderer.setDirections(result);
  const meters = result.routes[0]?.legs?.[0]?.distance?.value ?? 0;
  return Number((meters / 1000).toFixed(2));
}
