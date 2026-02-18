/* ========================
   auth.js - Identity Layer
   Rule: User stays logged in forever.
   Only explicit logout() shows the login screen.
   401 from backend triggers silent refresh, not logout.
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
        // Token is now an HttpOnly cookie — only backend can clear it
        // bj_phone is not sensitive auth data, keep it for display purposes
        localStorage.removeItem('bj_phone');
    },

    // --- Silent session validation via GET /auth/me ---
    // NEVER shows login or clears identity. Only refreshes stored phone + expireAt.
    validateSession: async function () {
        try {
            var res = await fetch(window.API_URL + '/auth/me', {
                credentials: 'include'
            });

            if (res.ok) {
                var data = await res.json();
                if (data && data.phone) {
                    localStorage.setItem('bj_phone', data.phone);
                }
                // Change 4: store expireAt for future proactive renewal
                if (data && data.expireAt) {
                    localStorage.setItem('bj_session_expire', String(data.expireAt));
                }
                console.log('[AUTH] Session valid. Identity confirmed:', data.phone);
                return true;
            }

            if (res.status === 401) {
                // Token expired in Firestore. bj_phone is still valid — user is known.
                // Remove only the dead token. Keep the phone. Send a fresh magic link silently.
                console.warn('[AUTH] Session expired (401). Refreshing silently — user stays in app.');
                localStorage.removeItem('bj_token');
                window.APP_AUTH.silentRefresh();
                return;
            }

            // Any other error (500, etc.) — do nothing. Stay on current screen.
            console.warn('[AUTH] /auth/me returned', res.status, '— staying on current screen.');
            return false;
        } catch (e) {
            // Network error — do NOT clear session, do NOT show login.
            console.warn('[AUTH] /auth/me unreachable. Staying on current screen.', e.message);
            return false;
        }
    },

    // Change 2: Silent refresh — sends new magic link WITHOUT showing login screen.
    // Triggered when session is expired/wiped from Firestore.
    silentRefresh: async function () {
        var phone = localStorage.getItem('bj_phone');

        // If no phone stored, this is a truly new device — show login (first time only).
        if (!phone) {
            console.warn('[AUTH] silentRefresh: no phone stored. First-time device. Showing login.');
            window.APP_AUTH.showLogin();
            return;
        }

        // Phone is known. Request a fresh magic link to their WhatsApp.
        // DO NOT show the login screen. User stays in the app.
        try {
            var res = await fetch(window.API_URL + '/auth/request-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phone })
            });
            if (res.ok) {
                console.log('[AUTH] silentRefresh: new magic link sent to', phone.slice(0, 5) + '***');
                if (window.showToast) {
                    window.showToast('Sesi kamu habis. Link masuk baru sudah dikirim ke WhatsApp kamu 📲', 7000);
                }
            } else {
                console.warn('[AUTH] silentRefresh: request-login failed with status', res.status);
            }
        } catch (e) {
            // Network error — do nothing. User stays on current screen.
            console.warn('[AUTH] silentRefresh: network error', e.message);
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
                credentials: 'include', // P1: backend sets HttpOnly cookie in response
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
                        var phone = (data.customer && data.customer.phone) || data.phone || '';
                        if (phone) localStorage.setItem('bj_phone', phone);

                        // Clean URL — remove ?token= from address bar
                        history.replaceState({}, document.title, window.location.pathname);

                        console.log('[AUTH] Magic link verified. Cookie set by backend.');
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

        // CASE 2: No magic link in URL.
        // Check if we have a stored phone (returning user) or not (first-time user).
        var storedPhone = localStorage.getItem('bj_phone');

        if (storedPhone) {
            // Returning user — show main immediately (optimistic), validate in background.
            // Change 3: NEVER show login on 401 — silentRefresh handles that.
            console.log('[AUTH] Returning user detected. Showing app immediately.');
            window.APP_AUTH.showMain();
            window.APP_AUTH.validateSession(); // background — never shows login
            return;
        }

        // CASE 3: Truly first-time user — no phone, no session.
        // Show loading spinner while checking cookie session.
        var loginView = document.getElementById('view-login');
        var mainView = document.getElementById('view-main');
        if (loginView) loginView.style.display = 'none';
        if (mainView) mainView.style.display = 'none';

        var loadingEl = document.getElementById('auth-loading');
        if (loadingEl) loadingEl.style.display = 'flex';

        // Try cookie session first — if it works, show main. Otherwise show login.
        window.APP_AUTH.validateSession().then(function (valid) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (valid) {
                // Cookie session is valid — show main
                window.APP_AUTH.showMain();
            } else {
                // No valid session — truly new user.
                console.log('[AUTH] No session found. Showing login.');
                window.APP_AUTH.showLogin();
            }
        }).catch(function () {
            if (loadingEl) loadingEl.style.display = 'none';
            window.APP_AUTH.showLogin();
        });
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
        // P1: Call backend to clear the HttpOnly cookie server-side
        fetch(window.API_URL + '/auth/logout', { method: 'POST', credentials: 'include' })
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
