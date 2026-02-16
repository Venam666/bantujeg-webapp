import { lockOrder, requestCheckoutToken, verifyCheckoutToken } from './api.js';
import { submitOrder } from './order.js';

export function bindCheckoutHandlers({ getSession, getDraft, setOrderId, onOrderLocked }) {
  const confirmBtn = document.getElementById('confirm-order-btn');
  const paymentInput = document.getElementById('checkout-payment');
  const paidInput = document.getElementById('paid-flag');
  const errorBox = document.getElementById('checkout-error');

  confirmBtn.addEventListener('click', async () => {
    errorBox.textContent = '';
    confirmBtn.disabled = true;

    try {
      const session = getSession();
      const draft = getDraft();
      if (!session) throw new Error('Session tidak ditemukan. Login ulang.');
      if (!draft) throw new Error('Lengkapi detail order terlebih dahulu.');

      draft.paymentType = paymentInput.value;
      const orderId = await submitOrder({ session, draft });

      const antiFraud = await requestCheckoutToken(orderId, session.sessionToken);
      await verifyCheckoutToken(orderId, antiFraud.token, session.sessionToken);

      await lockOrder(orderId, {
        paymentType: paymentInput.value,
        paymentStatus: paidInput.value,
      });

      setOrderId(orderId);
      onOrderLocked(orderId);
    } catch (err) {
      errorBox.textContent = `Checkout gagal: ${err.message}`;
    } finally {
      confirmBtn.disabled = false;
    }
  });
}
