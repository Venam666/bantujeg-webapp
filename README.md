# BantuJeg Modular MVP (Static Web)

## Module boundaries
- `js/api.js` is the only module that directly accesses Firestore and backend endpoints.
- `js/auth.js` handles magic-link login UX and token verification flow.
- `js/session.js` persists session in localStorage and revalidates it via backend.
- `js/order.js` builds structured order payload and requests server-side quote.
- `js/checkout.js` confirms order with anti-fraud checkout token flow.
- `js/status.js` listens to Firestore real-time order updates.
- `js/map.js` contains all Google Maps + routing logic.

## Firestore collections
- `login_tokens`
  - `phone`
  - `token`
  - `expireAt` (2 min)
  - `used` (one-time token)
- `orders`
  - `orderId`
  - `customerId`
  - `phone`
  - `serviceType`
  - `pickup`
  - `destination`
  - `distanceKm`
  - `price`
  - `paymentType`
  - `paymentStatus`
  - `status`
  - `driverId`
  - `createdAt`

## Security constraints
1. Price is fetched from backend `/quote` (single source of truth).
2. Magic token verification must happen on backend (`/verify-token`).
3. Checkout requires backend anti-fraud token (`/checkout-token`, `/verify-checkout-token`).
4. Open-order dedup check runs before creating a new order.
5. Driver assignment and status transition are backend-owned.

## Expected backend endpoints
- `POST /api/request-login`
- `POST /api/verify-token`
- `POST /api/update-session`
- `POST /api/quote`
- `POST /api/checkout-token`
- `POST /api/verify-checkout-token`
