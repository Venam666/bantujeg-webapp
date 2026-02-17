const API_BASE = window.APP?.api?.baseUrl || '';
const SERVER_UNAVAILABLE_TEXT = 'Server unavailable. Try again.';

async function request(path, { method = 'GET', body = null } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(SERVER_UNAVAILABLE_TEXT);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || SERVER_UNAVAILABLE_TEXT);
  }
  return data;
}

export async function fetchPricingConfig() {
  return request('/pricing/config');
}

export async function createOrder(payload) {
  const isQris = String(payload.payment_method || '').toLowerCase() === 'qris';
  return request(isQris ? '/orders/qris' : '/orders/create', { method: 'POST', body: payload });
}

export async function requestCancel(payload) {
  return request('/orders/cancel-request', { method: 'POST', body: payload });
}

export async function confirmPayment(payload) {
  const endpoints = ['/payments/confirm', '/orders/confirm-payment', '/orders/payment-confirm'];
  let lastError = new Error(SERVER_UNAVAILABLE_TEXT);
  for (const endpoint of endpoints) {
    try {
      return await request(endpoint, { method: 'POST', body: payload });
    } catch (err) {
      lastError = err;
      // Only continue cascade if it's a server-unavailable / 404 situation.
      // Stop cascade on explicit business errors (4xx with message).
      const msg = err?.message || '';
      if (msg !== SERVER_UNAVAILABLE_TEXT && !msg.includes('404') && !msg.includes('Not Found')) {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function fetchOrder(orderId) {
  try {
    return await request(`/orders/${encodeURIComponent(orderId)}`);
  } catch {
    return request(`/orders/status?orderId=${encodeURIComponent(orderId)}`);
  }
}
