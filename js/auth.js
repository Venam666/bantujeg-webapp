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
    if (window.APP.session && window.APP.session.setIdentity) {
      window.APP.session.setIdentity(phone);
    }

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
    // Show verification UI
    document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f8fafc;font-family:'Plus Jakarta Sans',sans-serif;padding:20px;text-align:center;">
            <h2 style="color:#10B981;">Memverifikasi...</h2>
            <div style="color:#64748B;margin-bottom:20px;">Mohon tunggu sebentar ⏳</div>
            <div id="debug-log" style="color:red; font-size:12px; font-family:monospace; background:#fee2e2; padding:10px; border-radius:8px; max-width: 100%; word-break: break-all;"></div>
        </div>
    `;

    const logEl = document.getElementById('debug-log');
    const log = (msg) => {
      console.log(msg);
      // Optional: uncomment to see all logs on screen
      // logEl.innerHTML += `<div>${msg}</div>`;
    };
    const errorLog = (msg) => {
      console.error(msg);
      logEl.innerHTML += `<div style="margin-bottom:8px;">${msg}</div>`;
    };

    try {
      // 1. Validate Environment
      if (!window.APP) throw new Error("window.APP is undefined");
      if (!window.APP.api) throw new Error("window.APP.api is undefined");

      const baseUrl = window.APP.api.baseUrl;
      if (!baseUrl) throw new Error("window.APP.api.baseUrl is missing!");

      const verifyUrl = `${baseUrl}/auth/verify`;

      log(`🔍 Attempting to verify token at: ${verifyUrl}`);
      log(`📝 Token: ${token.substring(0, 10)}...`);

      // 2. Execute Fetch
      const res = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      }).catch(err => {
        throw new Error(`Network Error (Fetch Failed): ${err.message}`);
      });

      log(`📡 Response Status: ${res.status}`);

      // 3. Parse Response
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON (${res.status}): ${text.substring(0, 100)}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || `Server Error (${res.status})`);
      }

      // 4. Success Handling
      log("✅ Verification Success! Saving session...");
      if (window.APP.session && window.APP.session.save) {
        window.APP.session.save(data.sessionToken, data.customer);
      } else {
        throw new Error("window.APP.session.save is missing!");
      }

      // Clean URL
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token');
      window.history.replaceState({}, '', cleanUrl.toString());

      // Reload
      window.location.reload();

    } catch (error) {
      errorLog(`❌ VERIFICATION CRASH: ${error.message}`);
      errorLog(`📚 Stack: ${error.stack}`);

      // Stop execution, let user see the error.
      // Do NOT auto-reload if it's a critical failure like this, so user can report it.
    }
  }
};
