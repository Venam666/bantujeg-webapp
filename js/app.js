// --- APP STATE & ORCHESTRATION ---

const BACKEND_URL = "http://localhost:3000";

// GLOBAL STATE
window.STATE = {
    token: null,
    phone: null,
    service: 'RIDE',
    pickup: { lat: null, lng: null, address: '' },
    dropoff: { lat: null, lng: null, address: '' }
};

// UI ELEMENTS
const overlay = document.getElementById('overlay');
const viewLogin = document.getElementById('view-login');
const viewMain = document.getElementById('view-main');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth (defined in auth.js)
    if (window.checkAuth) {
        await window.checkAuth();
    } else {
        console.error("Auth module not loaded!");
    }
});


// --- VIEW HELPERS ---
window.showOverlay = function (show) {
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
};

window.showLoginView = function () {
    viewLogin.classList.remove('hidden');
    viewMain.classList.add('hidden');
};

window.showMainView = function () {
    viewLogin.classList.add('hidden');
    viewMain.classList.remove('hidden');

    // Resize map trigger because it was hidden
    // We try to access the global map object from map.js
    setTimeout(() => {
        if (window.map) {
            google.maps.event.trigger(window.map, "resize");
        }
    }, 500);
};


// --- SERVICE LOGIC ---
window.setService = function (serviceName) {
    STATE.service = serviceName;
    // Update UI buttons
    document.querySelectorAll('.service-tab').forEach(btn => {
        if (btn.id === `btn-${serviceName}`) {
            btn.classList.add('active');
            btn.classList.remove('inactive');
        } else {
            btn.classList.add('inactive');
            btn.classList.remove('active');
        }
    });
};


// --- ORDER LOGIC ---
window.submitOrder = async function () {
    if (!STATE.pickup.lat || !STATE.dropoff.lat) {
        return alert("Mohon pilih lokasi Jemput dan Tujuan dari saran yang muncul.");
    }

    const noteText = document.getElementById('input-note').value;
    const selectedPaymentMethod = document.getElementById('input-payment').value;

    const payload = {
        service: STATE.service,
        customer_phone: STATE.phone,
        session_key: STATE.token,
        pickupLocation: { lat: STATE.pickup.lat, lng: STATE.pickup.lng },
        dropoffLocation: { lat: STATE.dropoff.lat, lng: STATE.dropoff.lng },
        origin: STATE.pickup.address,
        destination: STATE.dropoff.address,
        paymentMethod: selectedPaymentMethod,
        note: noteText
    };

    const endpoint = selectedPaymentMethod === 'QRIS' ? '/orders/qris' : '/orders/create';

    showOverlay(true);
    try {
        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${STATE.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            alert("ORDER BERHASIL! ID: " + (data.orderId || "OK"));
            // Optional: clear form logic here
            window.location.reload();
        } else {
            alert("Gagal Memesan: " + (data.message || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Terjadi kesalahan jaringan saat memesan.");
    } finally {
        showOverlay(false);
    }
};
