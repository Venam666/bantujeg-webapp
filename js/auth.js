window.APP = window.APP || {};
window.APP.auth = window.APP.auth || {};

window.APP.auth.requestMagicLink = async function (phone) {
  const btn = document.getElementById('btn-request-login');
  // Optional: input, feedback elements if they technically exist or we want to support them

  if (btn) {
    btn.disabled = true;
    const span = document.getElementById('login-btn-text');
    if (span) span.textContent = 'Mengirim...';
  }

  try {
    const baseUrl = window.APP.api ? window.APP.api.baseUrl : ''; // Fallback empty if not set, but it should be set

    const res = await fetch(`${baseUrl}/auth/request-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const contentType = res.headers.get("content-type");
    let data;
    if (contentType && contentType.indexOf("application/json") !== -1) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error("Server returned non-JSON response: " + text.substring(0, 50));
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Terjadi kesalahan pada server");
    }

    if (data.success) {
      alert('Link login telah dikirim ke WhatsApp Anda. Silakan cek WA Anda.');
    }

  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      const span = document.getElementById('login-btn-text');
      if (span) span.textContent = 'Kirim Link Login';
    }
  }
};

window.APP.auth.checkUrlForToken = async function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f8fafc;font-family:'Plus Jakarta Sans',sans-serif;">
                <h2 style="color:#10B981;">Memverifikasi...</h2>
                <div style="color:#64748B;">Mohon tunggu sebentar ⏳</div>
            </div>
        `;

    try {
      const baseUrl = window.APP.api ? window.APP.api.baseUrl : '';

      const res = await fetch(`${baseUrl}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error("Server returned non-JSON response: " + text.substring(0, 50));
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Link tidak valid");
      }

      // Success
      window.APP.session.save(data.sessionToken, data.customer);

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token');
      window.history.replaceState({}, '', cleanUrl.toString());

      window.location.reload();

    } catch (error) {
      alert("Link tidak valid atau sudah kadaluwarsa. (" + error.message + ")");
      console.error(error);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token');
      window.history.replaceState({}, '', cleanUrl.toString());
      window.location.reload();
    }
  }
};
