// --- AUTHENTICATION LOGIC ---

// Helper to check auth status
window.checkAuth = async function () {
    // Check URL for token (Magic Link)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
        await verifyToken(urlToken);
    } else {
        // Check LocalStorage
        const storedToken = localStorage.getItem('sessionToken');
        if (storedToken) {
            STATE.token = storedToken;
            STATE.phone = localStorage.getItem('customerPhone');
            showMainView();
        } else {
            showLoginView();
        }
    }
};

async function verifyToken(token) {
    showOverlay(true);
    try {
        const response = await fetch(`${BACKEND_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (response.ok && data.sessionToken) {
            // Success: Save session
            localStorage.setItem('sessionToken', data.sessionToken);
            localStorage.setItem('customerPhone', data.customer?.phone || '');

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);

            // Reload to clean state
            window.location.reload();
        } else {
            alert("Login Failed: " + (data.message || "Invalid Token"));
            showOverlay(false);
            showLoginView();
        }
    } catch (e) {
        console.error(e);
        alert("Network Error during Login");
        showOverlay(false);
        showLoginView();
    }
}

window.requestLogin = async function () {
    const phoneInput = document.getElementById('login-phone').value;
    if (!phoneInput) return alert("Please enter WhatsApp number");

    showOverlay(true);
    try {
        const res = await fetch(`${BACKEND_URL}/auth/request-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneInput })
        });
        const data = await res.json();

        if (res.ok) {
            alert("Login Link Sent! Check your WhatsApp.");
        } else {
            alert("Error: " + (data.message || "Failed to send link"));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error");
    } finally {
        showOverlay(false);
    }
};

window.logout = function () {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('customerPhone');
    window.location.reload();
};
