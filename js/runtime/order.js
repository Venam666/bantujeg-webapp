import { runtimeState } from './state.js';
import { createOrder, requestCancel, fetchOrder } from './api.js';

const SERVER_UNAVAILABLE_TEXT = 'Server unavailable. Try again.';

function normalizePhone(input) {
  if (!input) return '';
  let value = String(input).replace(/\D/g, '');
  if (value.startsWith('0')) value = `62${value.slice(1)}`;
  if (value.startsWith('8')) value = `62${value}`;
  return value;
}

function ensureSessionIdentity() {
  const session = window.APP.session || {};
  const existing = session.getIdentity ? session.getIdentity() : null;
  if (existing?.sessionKey && existing?.phone) return existing;

  const user = session.getUser ? session.getUser() : null;
  const phone = normalizePhone(user?.phone || user?.phoneNumber || user?.customer_phone || '');
  if (!phone) throw new Error('Nomor pelanggan tidak ditemukan. Silakan login ulang.');
  if (!session.setIdentity) throw new Error('Session identity tidak tersedia.');
  return session.setIdentity(phone);
}

function extractOrderId(response) {
  return response?.orderId || response?.order_id || response?.id || null;
}

function extractOrderStatus(response) {
  return response?.status || response?.order?.status || response?.order_status || '-';
}

export function buildOrderPayloadFromUI() {
  const origin = window.APP.places.origin?.geometry?.location;
  const dest = window.APP.places.dest?.geometry?.location;
  if (!origin || !dest) throw new Error('Lokasi belum lengkap.');

  const identity = ensureSessionIdentity();
  const state = runtimeState.getState();
  const paymentMethod = (state.paymentMethod || '').toLowerCase();
  if (!['cash', 'qris'].includes(paymentMethod)) {
    throw new Error('Metode pembayaran wajib dipilih.');
  }

  return {
    source: 'web',
    customer_phone: identity.phone,
    session_key: identity.sessionKey,
    pickup_coords: { lat: origin.lat(), lng: origin.lng() },
    dropoff_coords: { lat: dest.lat(), lng: dest.lng() },
    service_type: state.serviceType,
    notes: document.getElementById('note').value.trim(),
    payment_method: paymentMethod,
    price_hint: state.pricing?.estimate?.price || 0,
    pickupLocation: { lat: origin.lat(), lng: origin.lng() },
    dropoffLocation: { lat: dest.lat(), lng: dest.lng() },
    serviceType: state.serviceType,
    paymentMethod: paymentMethod === 'qris' ? 'QRIS' : 'CASH',
    origin: document.getElementById('origin').value.trim(),
    destination: document.getElementById('destination').value.trim(),
    note: document.getElementById('note').value.trim(),
  };
}

export async function submitOrder() {
  const payload = buildOrderPayloadFromUI();
  const response = await createOrder(payload);
  const orderId = extractOrderId(response);
  if (!orderId) throw new Error('Order ID tidak ditemukan dari backend.');

  runtimeState.updateState((s) => {
    s.orderStatus.activeOrderId = orderId;
    s.orderStatus.status = extractOrderStatus(response);
    s.orderStatus.paymentStatus = payload.payment_method === 'qris' ? 'UNPAID' : null;
  });

  return { response, payload, orderId };
}

export async function cancelOrder() {
  const state = runtimeState.getState();
  if (!state.orderStatus.activeOrderId) return null;

  const identity = ensureSessionIdentity();
  const response = await requestCancel({
    source: 'web',
    orderId: state.orderStatus.activeOrderId,
    customer_phone: identity.phone,
    session_key: identity.sessionKey,
    reason: 'user_request',
  });

  runtimeState.updateState((s) => {
    s.orderStatus.status = extractOrderStatus(response) || 'CANCELLED';
  });

  return response;
}

export async function pollOrderState() {
  const state = runtimeState.getState();
  if (!state.orderStatus.activeOrderId) return null;
  try {
    const payload = await fetchOrder(state.orderStatus.activeOrderId);
    const order = payload?.order || payload || {};
    runtimeState.updateState((s) => {
      s.orderStatus.status = order.status || s.orderStatus.status;
    });
    return order;
  } catch {
    throw new Error(SERVER_UNAVAILABLE_TEXT);
  }
}
