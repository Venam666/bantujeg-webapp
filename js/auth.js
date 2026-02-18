/* ========================
   auth.js - Identity Layer
   Rule: User stays logged in forever.
   Only 401 from backend clears identity.
   ======================== */

// 1. Global API Configuration
window.API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://tanganbantu-backend-422725955268.asia-southeast2.run.app';

console.log('[AUTH] API URL:', window.API_URL);

// 2. Define Namespace
window.APP_AUTH = {

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

    // --- Clear identity (only on explicit logout or 401) ---
    clearIdentity: function () {
        localStorage.removeItem('bj_token');
        localStorage.removeItem('bj_phone');
    },

    // --- Silent session validation via GET /auth/me ---
    // Called after showing main (optimistic). Only reacts to 401.
    validateSession: async function () {
        var token = localStorage.getItem('bj_token');
        if (!token) return;

        try {
            var res = await fetch(window.API_URL + '/auth/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.status === 401) {
                // Session expired or invalid — only case where we clear identity
                console.warn('[AUTH] Session invalid (401). Clearing identity.');
                window.APP_AUTH.clearIdentity();
                window.APP_AUTH.showLogin();
                return;
            }

            if (res.ok) {
                var data = await res.json();
                // Refresh phone in storage in case it was missing
                if (data && data.phone) {
                    localStorage.setItem('bj_phone', data.phone);
                }
                console.log('[AUTH] Session valid. Identity confirmed:', data.phone);
            }
            // Any other error (500, network) — do nothing. Stay logged in.
            // Backend is down ≠ user is logged out.
        } catch (e) {
            // Network error — do NOT clear token. Stay logged in.
            console.warn('[AUTH] /auth/me unreachable. Staying logged in.', e.message);
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
                        // sessionToken is the Firestore session key
                        var sessionToken = data.sessionToken || data.session_key || token;
                        var phone = (data.customer && data.customer.phone) || data.phone || '';

                        localStorage.setItem('bj_token', sessionToken);
                        if (phone) localStorage.setItem('bj_phone', phone);

                        // Clean URL — remove ?token= from address bar
                        history.replaceState({}, document.title, window.location.pathname);

                        console.log('[AUTH] Magic link verified. Identity locked.');
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

        // CASE 2: Token in localStorage — show main immediately, validate silently
        var savedToken = localStorage.getItem('bj_token');
        if (savedToken) {
            console.log('[AUTH] Existing session found. Showing app immediately.');
            window.APP_AUTH.showMain();
            // Silent background validation — only clears on 401
            window.APP_AUTH.validateSession();
            return;
        }

        // CASE 3: No token at all — show login
        console.log('[AUTH] No session. Showing login.');
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
