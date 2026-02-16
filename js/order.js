import { assertNoActiveOpenOrder, createOrder, getServerQuote } from './api.js';
import { geocodeAddress, previewRoute } from './map.js';

export function bindOrderHandlers({ session, onDraftReady, setDraft }) {
  const pickupInput = document.getElementById('pickup');
  const destinationInput = document.getElementById('destination');
  const serviceTypeInput = document.getElementById('service-type');
  const paymentTypeInput = document.getElementById('payment-type');
  const errorBox = document.getElementById('order-error');
  const distanceOut = document.getElementById('distance-output');
  const priceOut = document.getElementById('price-output');

  async function refreshDraft() {
    errorBox.textContent = '';
    const pickup = pickupInput.value.trim();
    const destination = destinationInput.value.trim();
    if (!pickup || !destination) return;

    try {
      const [pickupGeo, destinationGeo] = await Promise.all([
        geocodeAddress(pickup),
        geocodeAddress(destination),
      ]);
      const distanceKm = await previewRoute(
        { lat: pickupGeo.lat, lng: pickupGeo.lng },
        { lat: destinationGeo.lat, lng: destinationGeo.lng },
        serviceTypeInput.value,
      );
      const quote = await getServerQuote({
        serviceType: serviceTypeInput.value,
        distanceKm,
        pickup: pickupGeo.formattedAddress,
        destination: destinationGeo.formattedAddress,
      });

      distanceOut.textContent = `${distanceKm} km`;
      priceOut.textContent = `Rp ${Number(quote.price).toLocaleString('id-ID')}`;

      setDraft({
        serviceType: serviceTypeInput.value,
        paymentType: paymentTypeInput.value,
        pickup: pickupGeo.formattedAddress,
        destination: destinationGeo.formattedAddress,
        pickupGeo,
        destinationGeo,
        distanceKm,
        price: quote.price,
      });
      onDraftReady();
    } catch (err) {
      errorBox.textContent = `Gagal hitung order: ${err.message}`;
    }
  }

  ['blur', 'change'].forEach((evt) => {
    pickupInput.addEventListener(evt, refreshDraft);
    destinationInput.addEventListener(evt, refreshDraft);
    serviceTypeInput.addEventListener(evt, refreshDraft);
    paymentTypeInput.addEventListener(evt, refreshDraft);
  });
}

export async function submitOrder({ session, draft }) {
  const canCreate = await assertNoActiveOpenOrder(session.customerId);
  if (!canCreate) {
    throw new Error('Masih ada order aktif. Selesaikan/cancel order sebelumnya.');
  }

  const payload = {
    customerId: session.customerId,
    phone: session.phone,
    serviceType: draft.serviceType,
    pickup: draft.pickup,
    destination: draft.destination,
    distanceKm: draft.distanceKm,
    price: draft.price,
    paymentType: draft.paymentType,
  };

  const { orderId } = await createOrder(payload);
  return orderId;
}
