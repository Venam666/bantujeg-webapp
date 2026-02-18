/* ========================
   auth.js - The Login Cables
   ======================== */

// 1. Global API Configuration
window.API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://tanganbantu-backend-422725955268.asia-southeast2.run.app';

console.log('API URL set to:', window.API_URL);

// 2. Define Namespace
window.APP_AUTH = {

    // --- View toggling helpers ---
    showLogin: function () {
        const loginView = document.getElementById('view-login');
        const mainView = document.getElementById('view-main');
        if (loginView) loginView.style.display = 'flex';
        if (mainView) mainView.style.display = 'none';
    },

    showMain: function () {
        const loginView = document.getElementById('view-login');
        const mainView = document.getElementById('view-main');
        if (loginView) loginView.style.display = 'none';
        if (mainView) mainView.style.display = 'block';

        // Trigger map resize when showing main view to prevent gray box
        setTimeout(() => {
            if (window.APP && window.APP.map) {
                google.maps.event.trigger(window.APP.map, 'resize');
            }
        }, 100);
    },

    // --- Check URL for magic link token ---
    init: function () {
        var params = new URLSearchParams(window.location.search);
        var token = params.get('token');

        if (token) {
            console.log('Verifying token:', token);
            // Verify the token with backend
            fetch(window.API_URL + '/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token })
            })
                .then(function (res) {
                    if (!res.ok) {
                        // Pre-flight check for 404 or other errors
                        return res.text().then(function (text) {
                            console.error('Auth Verify Failed:', res.status, text.substring(0, 100));
                            throw new Error('Server responded with ' + res.status);
                        });
                    }
                    return res.json();
                })
                .then(function (data) {
                    if (data && data.success) {
                        console.log('Verification successful', data);
                        localStorage.setItem('bj_token', data.session_key || token);
                        localStorage.setItem('bj_phone', data.phone || '');

                        // Clean URL
                        history.replaceState({}, document.title, window.location.pathname);
                        window.APP_AUTH.showMain();
                    } else {
                        console.warn('Verification failed logic:', data);
                        alert('Link masuk tidak valid atau sudah kadaluarsa. Coba minta lagi ya.');
                        window.APP_AUTH.showLogin();
                    }
                })
                .catch(function (err) {
                    console.error('Auth verify error:', err);
                    alert('Gagal memverifikasi. Cek koneksi internet kamu.');
                    window.APP_AUTH.showLogin();
                });
            return; // Wait for async verify
        }

        // --- Check localStorage for existing session ---
        var savedToken = localStorage.getItem('bj_token');
        var savedPhone = localStorage.getItem('bj_phone');

        if (savedToken && savedPhone) {
            console.log('Session found, showing main app.');
            window.APP_AUTH.showMain();
        } else {
            console.log('No session, showing login.');
            window.APP_AUTH.showLogin();
        }
    },

    // --- Request login (send magic link) ---
    requestLogin: function () {
        var phoneInput = document.getElementById('phone-input');
        var phone = phoneInput.value.trim();

        if (!phone) {
            alert('Masukkan nomor HP dulu ya Kak!');
            return;
        }

        // Basic formatting
        if (phone.startsWith('0')) phone = '62' + phone.slice(1);
        if (!phone.startsWith('62')) phone = '62' + phone;

        console.log('Requesting login for:', phone);

        fetch(window.API_URL + '/auth/request-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone })
        })
            .then(function (res) {
                if (!res.ok) {
                    return res.text().then(function (text) {
                        console.error('Request Login Failed:', res.status, text.substring(0, 100));
                        throw new Error('Server responded with ' + res.status);
                    });
                }
                return res.json();
            })
            .then(function (data) {
                if (data && data.success) {
                    alert('Magic link sudah dikirim ke WhatsApp kamu! 🎉 Cek sekarang.');
                } else {
                    alert(data.message || 'Gagal mengirim link. Coba lagi.');
                }
            })
            .catch(function (err) {
                console.error('Request login error:', err);
                alert('Gagal terhubung ke server. Cek koneksi internet kamu.');
            });
    },

    // --- Logout helper ---
    logout: function () {
        localStorage.removeItem('bj_token');
        localStorage.removeItem('bj_phone');
        window.APP_AUTH.showLogin();
    }
};

// 3. Initialize & Export
// Use DOMContentLoaded to ensure elements exist before init runs if script is in head (defer helps, but safety first)
document.addEventListener('DOMContentLoaded', function () {
    window.APP_AUTH.init();
});

// Export functions to global scope for HTML event handlers
window.requestLogin = window.APP_AUTH.requestLogin;
window.logout = window.APP_AUTH.logout;
