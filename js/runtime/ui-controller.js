import { runtimeState } from './state.js';
import * as pricing from './pricing.js';
import * as order from './order.js';
import * as payment from './payment.js';

const SERVER_UNAVAILABLE_TEXT = 'Server unavailable. Try again.';
const PRICING_UNAVAILABLE_TEXT = 'Pricing unavailable';
let statusPolling = null;

function openSheet(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeSheet(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function ensureRuntimeUI() {
  // SAFEGUARD: Do not run if DOM not ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureRuntimeUI);
    return;
  }

  // Inject payment selector into dedicated mount point for deterministic positioning
  const mount = document.getElementById('payment-selector-mount');
  if (mount && !document.getElementById('payment-selector')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';
    wrapper.id = 'payment-selector';
    wrapper.innerHTML = `<div class="input-wrapper"><span class="input-icon">💳</span><select id="payment-method" aria-label="Metode pembayaran"><option value="" selected disabled>Pilih pembayaran</option><option value="cash">Cash</option><option value="qris">QRIS</option></select></div><p id="payment-method-hint" class="payment-method-hint">Pilih metode pembayaran</p>`;
    mount.appendChild(wrapper);
  }

  const host = document.getElementById('view-main');
  if (!host) return; // Wait for view-main

  if (!document.getElementById('post-order-sheet')) {
    const node = document.createElement('div');
    node.id = 'post-order-sheet';
    node.className = 'order-sheet hidden';
    node.innerHTML = `<div class="sheet-card"><h3>Order Terkirim</h3><p id="post-order-id">Order ID: -</p><p id="post-order-status">Status: -</p><p id="post-order-wa-note">Notifikasi akan dikirim lewat WhatsApp.</p><div class="sheet-actions"><button id="btn-cancel-order" type="button">Cancel Order</button><button id="btn-close-order-sheet" type="button">Tutup</button></div></div>`;
    host.appendChild(node);
  }
  if (!document.getElementById('qris-sheet')) {
    const node = document.createElement('div');
    node.id = 'qris-sheet';
    node.className = 'order-sheet hidden';
    node.innerHTML = `<div class="sheet-card"><h3>Pembayaran QRIS</h3><p id="qris-expected-amount">Total: Rp -</p><div id="qris-placeholder" class="qris-placeholder">QR akan muncul dari backend/payment channel.</div><p id="qris-countdown">Sisa waktu: 10:00</p><p class="muted">Bayar sesuai nominal unik agar terverifikasi otomatis.</p><div class="sheet-actions"><button id="btn-i-paid" type="button">I have paid</button><button id="btn-close-qris-sheet" type="button">Tutup</button></div></div>`;
    host.appendChild(node);
  }
  if (!document.getElementById('cancel-confirm-modal')) {
    const node = document.createElement('div');
    node.id = 'cancel-confirm-modal';
    node.className = 'order-sheet hidden';
    node.innerHTML = `<div class="sheet-card"><h3>Batalkan order?</h3><p>Order akan dibatalkan sesuai keputusan backend.</p><div class="sheet-actions"><button id="btn-confirm-cancel" type="button">Ya, Batalkan</button><button id="btn-dismiss-cancel" type="button">Tidak</button></div></div>`;
    host.appendChild(node);
  }
}

function renderError(msg) {
  const errCard = document.getElementById('error-card');
  const priceCard = document.getElementById('price-card');
  const btn = document.getElementById('btn-submit');
  const btnText = document.getElementById('btn-text');
  if (errCard) {
    errCard.style.display = 'block';
    errCard.innerText = `✖ ${msg}`;
  }
  if (priceCard) priceCard.style.display = 'none';
  if (btn) btn.classList.add('disabled');
  if (btnText) btnText.innerText = 'Periksa Data';
}

function refreshActionState() {
  const state = runtimeState.getState();
  const btn = document.getElementById('btn-submit');
  const textBtn = document.getElementById('btn-text');
  const paymentHint = document.getElementById('payment-method-hint');

  const originVal = document.getElementById('origin')?.value?.trim() || '';
  const destVal = document.getElementById('destination')?.value?.trim() || '';

  // STRICT AUTHORITY CHECK
  const isBackendReachable = state.pricing.available && !state.pricing.error;
  const hasEstimate = state.pricing.estimate?.price > 0;
  const hasPayment = ['cash', 'qris'].includes(String(state.paymentMethod || '').toLowerCase());

  // 1. FAIL CLOSED if Backend Unreachable
  if (!isBackendReachable) {
    btn.classList.add('disabled');
    textBtn.innerText = PRICING_UNAVAILABLE_TEXT;
    if (paymentHint) paymentHint.textContent = "Sistem sedang offline/sibuk.";
    return;
  }

  // 2. FAIL CLOSED if Input Incomplete
  if (!hasPayment || !originVal || !destVal) {
    btn.classList.add('disabled');
    textBtn.innerText = hasPayment ? 'Isi Lokasi Dulu' : 'Pilih Pembayaran';
    if (paymentHint) paymentHint.textContent = hasPayment ? 'Pilih metode pembayaran' : 'Pilih Cash atau QRIS';
    return;
  }

  // 3. FAIL CLOSED if No Estimate (Backend didn't calculate)
  if (!hasEstimate) {
    btn.classList.add('disabled');
    textBtn.innerText = "Menghitung Harga...";
    return;
  }

  // ALL CHECKS PASSED -> UNLOCK
  btn.classList.remove('disabled');

  const priceDisplay = Number(state.pricing.estimate.price).toLocaleString('id-ID');

  textBtn.innerText = `GAS ORDER • Rp ${priceDisplay}`;

  if (paymentHint) paymentHint.textContent = state.paymentMethod === 'qris'
    ? 'Transfer sesuai nominal unik'
    : 'Bayar langsung ke driver';
}


function renderPricing(distanceKm, estimate) {
  if (!estimate) {
    renderError(PRICING_UNAVAILABLE_TEXT);
    return;
  }
  document.getElementById('fake-price').innerText = `Rp ${Number(estimate.fakePrice).toLocaleString('id-ID')}`;
  document.getElementById('price-display').innerText = `Rp ${Number(estimate.price).toLocaleString('id-ID')}`;
  document.getElementById('dist-display').innerText = `${distanceKm.toFixed(1)} km`;
  document.getElementById('price-card').style.display = 'flex';
  document.getElementById('error-card').style.display = 'none';
  refreshActionState();
}

function renderOrderStatus() {
  const state = runtimeState.getState();
  const orderId = state.orderStatus.activeOrderId || '-';
  const status = state.orderStatus.status || '-';
  const statusEl = document.getElementById('post-order-status');
  if (document.getElementById('post-order-id')) document.getElementById('post-order-id').textContent = `Order ID: ${orderId}`;
  if (statusEl) statusEl.textContent = `Status: ${status}`;
}

function bindButtons() {
  const paymentSelect = document.getElementById('payment-method');
  if (paymentSelect && !paymentSelect.dataset.runtimeBound) {
    paymentSelect.dataset.runtimeBound = '1';
    paymentSelect.value = '';
    paymentSelect.addEventListener('change', () => {
      runtimeState.updateState((s) => {
        s.paymentMethod = paymentSelect.value;
      });
      refreshActionState();
    });
  }

  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit && !btnSubmit.dataset.runtimeBound) {
    btnSubmit.dataset.runtimeBound = '1';
    btnSubmit.addEventListener('click', async (event) => {
      event.preventDefault();
      if (btnSubmit.classList.contains('disabled')) return;
      btnSubmit.classList.add('disabled');
      document.getElementById('loading-spin').style.display = 'block';
      document.getElementById('btn-text').style.display = 'none';
      try {
        const { response, payload, orderId } = await order.submitOrder();
        renderOrderStatus();
        openSheet('post-order-sheet');

        if (payload.payment_method === 'qris') {
          const expected = response.expected_amount || response.payment?.expected_amount || 0;
          document.getElementById('qris-expected-amount').textContent = `Total: Rp ${Number(expected).toLocaleString('id-ID')}`;
          await payment.renderQris(document.getElementById('qris-placeholder'), response.qr_image_url || response.qrImageUrl || response.payment?.qr_image_url || response.payment?.qrImageUrl || '');
          payment.startQrisCountdown((remaining) => {
            const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
            const ss = String(remaining % 60).padStart(2, '0');
            document.getElementById('qris-countdown').textContent = `Sisa waktu: ${mm}:${ss}`;
            if (remaining <= 0) {
              const btnPaid = document.getElementById('btn-i-paid');
              if (btnPaid) {
                btnPaid.disabled = true;
                btnPaid.textContent = 'Pembayaran kedaluwarsa';
              }
            }
          });
          openSheet('qris-sheet');
        }

        if (statusPolling) clearInterval(statusPolling);
        statusPolling = setInterval(async () => {
          try {
            await order.pollOrderState();
            renderOrderStatus();
          } catch {
            // keep last known status
          }
        }, 5000);
      } catch (error) {
        renderError(/Lokasi|Order ID|Nomor pelanggan|Metode pembayaran/.test(error.message) ? error.message : SERVER_UNAVAILABLE_TEXT);
      } finally {
        document.getElementById('loading-spin').style.display = 'none';
        document.getElementById('btn-text').style.display = 'block';
        refreshActionState();
      }
    });
  }

  const btnCancel = document.getElementById('btn-cancel-order');
  if (btnCancel && !btnCancel.dataset.runtimeBound) {
    btnCancel.dataset.runtimeBound = '1';
    btnCancel.addEventListener('click', () => openSheet('cancel-confirm-modal'));
  }
  const btnDismiss = document.getElementById('btn-dismiss-cancel');
  if (btnDismiss && !btnDismiss.dataset.runtimeBound) {
    btnDismiss.dataset.runtimeBound = '1';
    btnDismiss.addEventListener('click', () => closeSheet('cancel-confirm-modal'));
  }
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
  if (btnConfirmCancel && !btnConfirmCancel.dataset.runtimeBound) {
    btnConfirmCancel.dataset.runtimeBound = '1';
    btnConfirmCancel.addEventListener('click', async () => {
      try {
        await order.cancelOrder();
        renderOrderStatus();
        closeSheet('cancel-confirm-modal');
      } catch {
        alert(SERVER_UNAVAILABLE_TEXT);
      }
    });
  }
  const btnClosePost = document.getElementById('btn-close-order-sheet');
  if (btnClosePost && !btnClosePost.dataset.runtimeBound) {
    btnClosePost.dataset.runtimeBound = '1';
    btnClosePost.addEventListener('click', () => closeSheet('post-order-sheet'));
  }
  const btnCloseQris = document.getElementById('btn-close-qris-sheet');
  if (btnCloseQris && !btnCloseQris.dataset.runtimeBound) {
    btnCloseQris.dataset.runtimeBound = '1';
    btnCloseQris.addEventListener('click', () => closeSheet('qris-sheet'));
  }
  const btnPaid = document.getElementById('btn-i-paid');
  if (btnPaid && !btnPaid.dataset.runtimeBound) {
    btnPaid.dataset.runtimeBound = '1';
    btnPaid.addEventListener('click', async () => {
      if (btnPaid.disabled) return;
      btnPaid.disabled = true;
      btnPaid.innerHTML = '<span class="btn-inline-spinner"></span>Memproses...';
      try {
        await payment.confirmQrisPaid();
        runtimeState.updateState((s) => {
          s.orderStatus.status = 'Menunggu konfirmasi pembayaran';
        });
        renderOrderStatus();
      } catch {
        alert(SERVER_UNAVAILABLE_TEXT);
      } finally {
        const s = runtimeState.getState();
        if ((s.orderStatus.qrisCountdownSeconds || 0) > 0) {
          btnPaid.disabled = false;
          btnPaid.textContent = 'I have paid';
        }
      }
    });
  }
}

async function initialize() {
  ensureRuntimeUI();
  bindButtons();
  await pricing.loadConfig();
  refreshActionState();
}

function onServiceChanged(serviceType) {
  runtimeState.updateState((s) => {
    s.serviceType = serviceType;
    s.pricing.estimate = null;
  });
  refreshActionState();
}

function onLocationChanged(pickup, dropoff) {
  runtimeState.updateState((s) => {
    s.pickup = pickup;
    s.dropoff = dropoff;
  });
  refreshActionState();
}

function calculatePrice(distanceKm, serviceType, carOptions) {
  const estimate = pricing.calculatePreview({ distanceKm, serviceType, carOptions });
  renderPricing(distanceKm, estimate);
  return estimate;
}

export const runtimeUI = {
  initialize,
  onServiceChanged,
  onLocationChanged,
  calculatePrice,
  refreshActionState,
  renderError,
  openSheet,
  closeSheet,
};

window.RUNTIME = window.RUNTIME || {};
window.RUNTIME.ui = runtimeUI;
