const API_BASE = window.APP?.api?.baseUrl || '';

async function request(path, { method = 'GET', body = null } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export async function requestLogin(phone) {
  return request('/auth/request-login', { method: 'POST', body: { phone } });
}

export async function verifyToken(token) {
  return request('/auth/verify', { method: 'POST', body: { token } });
}

export async function updateSession(session) {
  return request('/auth/update-session', { method: 'POST', body: { session } });
}

export async function getServerQuote(input) {
  return request('/quote', { method: 'POST', body: input });
}

export async function createOrder(payload) {
  const isQris = String(payload.payment_method || payload.paymentMethod || '').toLowerCase() === 'qris';
  const path = isQris ? '/orders/qris' : '/orders/create';
  return request(path, { method: 'POST', body: payload });
}

export async function cancelOrder(payload) {
  return request('/orders/cancel-request', { method: 'POST', body: payload });
}

export async function confirmPayment(payload) {
  const paths = ['/payments/confirm', '/orders/confirm-payment', '/orders/payment-confirm'];
  for (const path of paths) {
    try {
      return await request(path, { method: 'POST', body: payload });
    } catch {
      // try next known endpoint
    }
  }
  throw new Error('Payment confirmation endpoint unavailable');
}

export async function fetchOrder(orderId) {
  try {
    return await request(`/orders/${encodeURIComponent(orderId)}`);
  } catch {
    return request(`/orders/status?orderId=${encodeURIComponent(orderId)}`);
  }
}

export function subscribeOrder(orderId, cb) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const payload = await fetchOrder(orderId);
      cb(payload?.order || payload);
    } catch {
      cb(null);
    }
  };

  tick();
  const handle = setInterval(tick, 5000);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

export async function assertNoActiveOpenOrder() {
  return true;
}
