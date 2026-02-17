/**
 * NETWORK LAYER - Strict Authority Contract
 * 
 * All traffic MUST go through here.
 * No direct fetch() allowed in other modules.
 */

const BASE_URL = window.APP.api.baseUrl;

async function request(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const res = await fetch(`${BASE_URL}${endpoint}`, options);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}:Server unavailable`);
        }

        return await res.json();
    } catch (err) {
        console.error(`[NETWORK] Failed ${endpoint}:`, err);
        throw err; // Propagate to Crash Shield or Caller
    }
}

export const API = {
    pricing: {
        config: () => request('/pricing/config')
    },
    orders: {
        create: (payload) => request('/orders/create', 'POST', payload),
        cancel: (payload) => request('/orders/cancel-request', 'POST', payload),
        status: (id) => request(`/orders/${id}/status`),
        qris: (payload) => request('/orders/qris', 'POST', payload) // If applicable
    }
};
