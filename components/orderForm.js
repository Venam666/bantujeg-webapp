export function renderOrderForm() {
  return `
    <section class="card" id="order-form-card">
      <h2>Buat Order</h2>
      <div class="grid grid-2">
        <div>
          <label for="service-type">Layanan</label>
          <select id="service-type">
            <option value="RIDE">Ride</option>
            <option value="CAR">Car</option>
            <option value="SEND">Send</option>
          </select>
        </div>
        <div>
          <label for="payment-type">Pembayaran</label>
          <select id="payment-type">
            <option value="CASH">Cash</option>
            <option value="QRIS">QRIS</option>
          </select>
        </div>
        <div>
          <label for="pickup">Pickup</label>
          <input id="pickup" type="text" placeholder="Alamat pickup" />
        </div>
        <div>
          <label for="destination">Destination</label>
          <input id="destination" type="text" placeholder="Alamat tujuan" />
        </div>
      </div>
      <div class="inline small muted" style="margin-top:10px;">
        <span>Estimasi jarak:</span><strong id="distance-output">-</strong>
        <span>Harga sistem:</span><strong id="price-output">-</strong>
      </div>
      <div class="error" id="order-error"></div>
    </section>
  `;
}
