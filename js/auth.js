// ========================
// auth.js - The Login Cables
// ========================

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://tanganbantu-backend-422725955268.asia-southeast2.run.app';

// --- View toggling helpers ---
function showLogin() {
    document.getElementById('view-login').style.display = 'flex';
    document.getElementById('view-main').style.display = 'none';
}

function showMain() {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-main').style.display = 'block';
}

// --- Check URL for magic link token ---
(function checkMagicLink() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('token');

    if (token) {
        // Verify the token with backend
        fetch(API_URL + '/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.success) {
                    localStorage.setItem('bj_token', data.session_key || token);
                    localStorage.setItem('bj_phone', data.phone || '');
                    // Clean URL
                    history.replaceState({}, document.title, window.location.pathname);
                    showMain();
                } else {
                    alert('Link masuk tidak valid atau sudah kadaluarsa. Coba minta lagi ya.');
                    showLogin();
                }
            })
            .catch(function (err) {
                console.error('Auth verify error:', err);
                alert('Gagal memverifikasi. Cek koneksi internet kamu.');
                showLogin();
            });
        return; // Wait for async verify
    }

    // --- Check localStorage for existing session ---
    var savedToken = localStorage.getItem('bj_token');
    var savedPhone = localStorage.getItem('bj_phone');

    if (savedToken && savedPhone) {
        showMain();
    } else {
        showLogin();
    }
})();

// --- Request login (send magic link) ---
window.requestLogin = function () {
    var phone = document.getElementById('phone-input').value.trim();
    if (!phone) {
        alert('Masukkan nomor HP dulu ya Kak!');
        return;
    }

    fetch(API_URL + '/auth/request-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone })
    })
        .then(function (res) { return res.json(); })
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
};

// --- Logout helper (expose to window for future use) ---
window.logout = function () {
    localStorage.removeItem('bj_token');
    localStorage.removeItem('bj_phone');
    showLogin();
};
