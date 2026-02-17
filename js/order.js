import { createOrder } from './api.js';
// map.js completely removed to avoid conflict with legacy-logic.js

export function bindOrderHandlers({ session, onDraftReady, setDraft }) {
  // Logic moved to legacy-logic.js
  console.log("Order handlers delegated to Legacy Logic");
}

export async function submitOrder({ session, draft }) {
  const payload = {
    source: 'web',
    customer_phone: session.phone,
    session_key: session.sessionKey,
    pickup_coords: draft.pickup,
    dropoff_coords: draft.destination,
    service_type: draft.serviceType,
    notes: draft.notes || '',
    payment_method: String(draft.paymentType || 'cash').toLowerCase(),
    price_hint: draft.price
  };

  const response = await createOrder(payload);
  return response?.orderId || response?.order_id || response?.id;
}
