import { submitOrder } from './order.js';

export function bindCheckoutHandlers({ getSession, getDraft, setOrderId, onOrderLocked }) {
  const confirmBtn = document.getElementById('confirm-order-btn');
  const paymentInput = document.getElementById('checkout-payment');
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

      setOrderId(orderId);
      onOrderLocked(orderId);
    } catch (err) {
      errorBox.textContent = `Checkout gagal: ${err.message}`;
    } finally {
      confirmBtn.disabled = false;
    }
  });
}
