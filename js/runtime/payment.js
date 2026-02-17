import { runtimeState } from './state.js';
import { confirmPayment } from './api.js';

const QRIS_DURATION_SECONDS = 10 * 60;
let countdownHandle = null;

async function discoverDummyQrisAsset() {
  try {
    const indexRes = await fetch('/assets/qris/index.json');
    if (indexRes.ok) {
      const list = await indexRes.json();
      if (Array.isArray(list) && list.length) return `/assets/qris/${list[0]}`;
    }
  } catch {
    // continue
  }

  try {
    const htmlRes = await fetch('/assets/qris/');
    if (!htmlRes.ok) return null;
    const html = await htmlRes.text();
    const matches = [...html.matchAll(/href=["']([^"']+\.(png|jpg|jpeg|webp|svg))["']/gi)];
    if (!matches.length) return null;
    const candidate = matches[0][1].replace(/^\./, '');
    return candidate.startsWith('/') ? candidate : `/assets/qris/${candidate}`;
  } catch {
    return null;
  }
}

export async function renderQris(container, qrImageUrl) {
  if (!container) return;

  const DUMMY_PATH = '/assets/qris/dummy.png';

  if (qrImageUrl) {
    container.innerHTML = `<img src="${qrImageUrl}" alt="QRIS" style="max-width:100%;max-height:180px;border-radius:8px;" />`;
    return;
  }

  const discovered = await discoverDummyQrisAsset();
  const finalImage = discovered || DUMMY_PATH;

  container.innerHTML = `<img src="${finalImage}" alt="QRIS Dummy" style="max-width:100%;max-height:180px;border-radius:8px;" /><div class="qris-dummy">Scan QR di atas (Mode Manual)</div>`;
}

export function startQrisCountdown(onTick) {
  if (countdownHandle) clearInterval(countdownHandle);
  runtimeState.updateState((s) => {
    s.orderStatus.qrisCountdownSeconds = QRIS_DURATION_SECONDS;
  });

  countdownHandle = setInterval(() => {
    runtimeState.updateState((s) => {
      s.orderStatus.qrisCountdownSeconds = Math.max(0, (s.orderStatus.qrisCountdownSeconds || 0) - 1);
    });
    const s = runtimeState.getState();
    if (typeof onTick === 'function') onTick(s.orderStatus.qrisCountdownSeconds);
    if (s.orderStatus.qrisCountdownSeconds <= 0) {
      clearInterval(countdownHandle);
      countdownHandle = null;
    }
  }, 1000);
}

export function stopQrisCountdown() {
  if (countdownHandle) {
    clearInterval(countdownHandle);
    countdownHandle = null;
  }
}

export async function confirmQrisPaid() {
  const state = runtimeState.getState();
  const orderId = state.orderStatus.activeOrderId;
  if (!orderId || state.orderStatus.qrisConfirmLocked || state.orderStatus.qrisCountdownSeconds <= 0) return null;

  const identity = window.APP.session?.getIdentity ? window.APP.session.getIdentity() : null;
  if (!identity?.phone || !identity?.sessionKey) {
    throw new Error('Nomor pelanggan tidak ditemukan. Silakan login ulang.');
  }

  runtimeState.updateState((s) => {
    s.orderStatus.qrisConfirmLocked = true;
  });

  try {
    await confirmPayment({
      orderId,
      source: 'web',
      customer_phone: identity.phone,
      session_key: identity.sessionKey,
    });

    runtimeState.updateState((s) => {
      s.orderStatus.paymentStatus = 'PENDING_CONFIRMATION';
    });
    return true;
  } finally {
    runtimeState.updateState((s) => {
      s.orderStatus.qrisConfirmLocked = false;
    });
  }
}
