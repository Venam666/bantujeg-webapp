export function renderCheckoutUI() {
  return `
    <section class="card" id="checkout-card">
      <h2>Checkout</h2>
      <p class="muted">Checkout hanya mengunci order + status pembayaran (paid / unpaid). Tidak ada fake payment gateway.</p>
      <div class="grid grid-2">
        <div>
          <label for="checkout-payment">Metode Bayar</label>
          <select id="checkout-payment">
            <option value="CASH">Cash</option>
            <option value="QRIS">QRIS</option>
          </select>
        </div>
        <div>
          <label for="paid-flag">Status Pembayaran</label>
          <select id="paid-flag">
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>
      <button type="button" id="confirm-order-btn" style="margin-top:12px;">Konfirmasi Order</button>
      <div id="checkout-error" class="error"></div>
    </section>
  `;
}
