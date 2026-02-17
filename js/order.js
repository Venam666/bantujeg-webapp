import { assertNoActiveOpenOrder, createOrder, getServerQuote } from './api.js';
// map.js completely removed to avoid conflict with legacy-logic.js

export function bindOrderHandlers({ session, onDraftReady, setDraft }) {
  // Logic moved to legacy-logic.js
  console.log("Order handlers delegated to Legacy Logic");
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
