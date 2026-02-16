export function renderLogin() {
  return `
    <section class="card" id="login-card">
      <h2>Masuk via WhatsApp Magic Link</h2>
      <p class="muted">Masukkan nomor WhatsApp aktif. Token login berlaku 2 menit dan hanya dapat dipakai sekali.</p>
      <div class="grid">
        <div>
          <label for="phone-input">Nomor WhatsApp</label>
          <input id="phone-input" type="text" inputmode="tel" placeholder="62812xxxxxxx" autocomplete="tel" />
        </div>
        <button id="request-login-btn" type="button">Kirim Magic Link</button>
        <div id="login-feedback" class="muted"></div>
        <div id="login-error" class="error"></div>
      </div>
    </section>
  `;
}

export function bindLoginEvents() {
  const btn = document.getElementById('request-login-btn');
  const input = document.getElementById('phone-input');

  if (btn && input) {
    btn.addEventListener('click', () => {
      const phone = input.value.trim();
      if (!phone) {
        alert("Nomor telepon wajib diisi");
        return;
      }
      window.APP.auth.requestMagicLink(phone);
    });
  }
}
