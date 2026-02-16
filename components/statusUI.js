const COPY = {
  CREATED: 'Order dibuat',
  BROADCAST: 'Mencari driver',
  ACCEPTED: 'Driver ditemukan',
  DRIVER_OTW: 'Driver menuju pickup',
  ON_TRIP: 'Perjalanan dimulai',
  COMPLETED: 'Order selesai',
  CANCELLED: 'Order dibatalkan',
};

export function renderStatusUI() {
  return `
    <section class="card" id="status-card">
      <h2>Status Real-time</h2>
      <div id="status-badge" class="status-badge"><span class="dot"></span><span>Belum ada order</span></div>
      <p class="muted" id="status-driver">Driver: -</p>
      <p class="muted" id="status-order-id">Order ID: -</p>
    </section>
  `;
}

export function mapStatusToText(status) {
  return COPY[status] ?? status;
}
