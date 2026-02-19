/* ========================
   auth.js - Identity Layer (Bearer Token)
   Rule: User stays logged in until token expires or explicit logout.
   401 from backend → show login screen. No automatic re-login.
   ======================== */

// 1. Global API Configuration
window.API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://tanganbantu-backend-422725955268.asia-southeast2.run.app';

console.log('[AUTH] Using Bearer session system');
console.log('[AUTH] API URL:', window.API_URL);

// 2. Define Namespace
window.APP_AUTH = {

    // --- Auth header helper (used by auth.js and app.js) ---
    getAuthHeaders: function () {
        var token = localStorage.getItem('bj_token');
        if (!token) return {};
        return { 'Authorization': 'Bearer ' + token };
    },

    // --- View toggling helpers ---
    showLogin: function () {
        var loginView = document.getElementById('view-login');
        var mainView = document.getElementById('view-main');
        if (loginView) loginView.style.display = 'flex';
        if (mainView) mainView.style.display = 'none';
    },

    showMain: function () {
        var loginView = document.getElementById('view-login');
        var mainView = document.getElementById('view-main');
        if (loginView) loginView.style.display = 'none';
        if (mainView) mainView.style.display = 'block';

        // Trigger map resize when showing main view to prevent gray box
        setTimeout(function () {
            if (window.APP && window.APP.map) {
                google.maps.event.trigger(window.APP.map, 'resize');
            }
        }, 100);
    },

    // --- Clear identity (logout or expired session) ---
    clearIdentity: function () {
        localStorage.removeItem('bj_token');
        localStorage.removeItem('bj_phone');
        localStorage.removeItem('bj_session_expire');
    },

    // --- Session validation via GET /auth/me ---
    validateSession: async function () {
        try {
            var headers = window.APP_AUTH.getAuthHeaders();

            // No token in localStorage → skip request entirely
            if (!headers['Authorization']) {
                console.log('[AUTH] No token in localStorage. Skipping /auth/me.');
                return false;
            }

            var res = await fetch(window.API_URL + '/auth/me', {
                headers: headers
            });

            if (res.ok) {
                var data = await res.json();
                if (data && data.phone) {
                    localStorage.setItem('bj_phone', data.phone);
                }
                if (data && data.expireAt) {
                    localStorage.setItem('bj_session_expire', String(data.expireAt));
                }
                console.log('[AUTH] Session valid. Identity confirmed:', data.phone);
                return true;
            }

            if (res.status === 401) {
                console.warn('[AUTH] Session invalid (401). Showing login.');
                window.APP_AUTH.clearIdentity();
                window.APP_AUTH.showLogin();
                return false;
            }

            // Any other error (500, etc.)
            console.warn('[AUTH] /auth/me returned', res.status, '— unexpected error.');
            return false;
        } catch (e) {
            // Network error — do NOT clear session, do NOT show login.
            console.warn('[AUTH] /auth/me unreachable. Staying on current screen.', e.message);
            return false;
        }
    },

    // --- Main init: called on DOMContentLoaded ---
    init: function () {
        var params = new URLSearchParams(window.location.search);
        var token = params.get('token');

        // CASE 1: Magic link in URL — verify it
        if (token) {
            console.log('[AUTH] Magic link token found. Verifying...');
            fetch(window.API_URL + '/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token })
            })
                .then(function (res) {
                    if (!res.ok) {
                        return res.text().then(function (text) {
                            console.error('[AUTH] Verify failed:', res.status, text.substring(0, 100));
                            throw new Error('Server responded with ' + res.status);
                        });
                    }
                    return res.json();
                })
                .then(function (data) {
                    if (data && data.success) {
                        // Store Bearer session token in localStorage
                        if (data.sessionToken) {
                            localStorage.setItem('bj_token', data.sessionToken);
                            console.log('[AUTH] Session token stored in localStorage.');
                        }

                        var phone = (data.customer && data.customer.phone) || data.phone || '';
                        if (phone) localStorage.setItem('bj_phone', phone);

                        // Clean URL — remove ?token= from address bar
                        history.replaceState({}, document.title, window.location.pathname);

                        console.log('[AUTH] Magic link verified. Bearer token stored.');
                        window.APP_AUTH.showMain();
                    } else {
                        console.warn('[AUTH] Verification logic failed:', data);
                        if (window.showToast) window.showToast('Link tidak valid atau sudah dipakai. Minta link baru ya.');
                        else alert('Link masuk tidak valid atau sudah kadaluarsa. Coba minta lagi ya.');
                        window.APP_AUTH.showLogin();
                    }
                })
                .catch(function (err) {
                    console.error('[AUTH] Verify error:', err);
                    if (window.showToast) window.showToast('Gagal memverifikasi. Cek koneksi internet kamu.');
                    else alert('Gagal memverifikasi. Cek koneksi internet kamu.');
                    window.APP_AUTH.showLogin();
                });
            return; // Wait for async verify
        }

        // CASE 2: No magic link in URL — check localStorage for token.
        var storedToken = localStorage.getItem('bj_token');

        if (storedToken) {
            // Token exists — show main immediately (optimistic), validate in background.
            console.log('[AUTH] Stored token found. Showing app immediately.');
            window.APP_AUTH.showMain();
            window.APP_AUTH.validateSession(); // background — shows login on 401
            return;
        }

        // CASE 3: No token at all — first-time user. Show login directly.
        console.log('[AUTH] No session found. Showing login.');
        window.APP_AUTH.showLogin();
    },

    // --- Request login (send magic link) ---
    requestLogin: function () {
        var phoneInput = document.getElementById('phone-input');
        var phone = phoneInput ? phoneInput.value.trim() : '';

        if (!phone) {
            if (window.showToast) window.showToast('Masukkan nomor HP dulu ya Kak!');
            else alert('Masukkan nomor HP dulu ya Kak!');
            return;
        }

        // Normalize phone
        if (phone.startsWith('0')) phone = '62' + phone.slice(1);
        if (!phone.startsWith('62')) phone = '62' + phone;

        console.log('[AUTH] Requesting magic link for:', phone);

        // Disable button while sending
        var btn = document.querySelector('.btn-login');
        if (btn) { btn.disabled = true; btn.innerText = '⏳ Mengirim...'; }

        fetch(window.API_URL + '/auth/request-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone })
        })
            .then(function (res) {
                if (!res.ok) {
                    return res.text().then(function (text) {
                        console.error('[AUTH] Request login failed:', res.status, text.substring(0, 100));
                        throw new Error('Server responded with ' + res.status);
                    });
                }
                return res.json();
            })
            .then(function (data) {
                if (btn) { btn.disabled = false; btn.innerText = 'Kirim Magic Link →'; }
                if (data && data.success) {
                    if (window.showToast) window.showToast('Magic link dikirim ke WhatsApp kamu! 🎉 Cek sekarang.', 5000);
                    else alert('Magic link sudah dikirim ke WhatsApp kamu! 🎉 Cek sekarang.');
                } else {
                    if (window.showToast) window.showToast(data.message || 'Gagal mengirim link. Coba lagi.');
                    else alert(data.message || 'Gagal mengirim link. Coba lagi.');
                }
            })
            .catch(function (err) {
                if (btn) { btn.disabled = false; btn.innerText = 'Kirim Magic Link →'; }
                console.error('[AUTH] Request login error:', err);
                if (window.showToast) window.showToast('Gagal terhubung ke server. Cek koneksi internet kamu.');
                else alert('Gagal terhubung ke server. Cek koneksi internet kamu.');
            });
    },

    // --- Logout: only explicit user action ---
    logout: function () {
        // Notify backend (best-effort, for future server-side session invalidation)
        var headers = window.APP_AUTH.getAuthHeaders();
        fetch(window.API_URL + '/auth/logout', { method: 'POST', headers: headers })
            .catch(function (e) { console.warn('[AUTH] Logout endpoint error:', e.message); });
        window.APP_AUTH.clearIdentity();
        window.APP_AUTH.showLogin();
    }
};

// 3. Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    window.APP_AUTH.init();
});

// 4. Export to global scope for HTML event handlers
window.requestLogin = function () { window.APP_AUTH.requestLogin(); };
window.logout = function () { window.APP_AUTH.logout(); };
