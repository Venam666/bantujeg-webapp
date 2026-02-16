import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDwbtq81niH-J_a8N_VS0gAEehuBUCrNWM',
  authDomain: 'gen-lang-client-0674280520.firebaseapp.com',
  projectId: 'gen-lang-client-0674280520',
  storageBucket: 'gen-lang-client-0674280520.firebasestorage.app',
  messagingSenderId: '422725955268',
  appId: '1:422725955268:web:d8b1eba575e6ed87342391',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const API_BASE = window.__API_BASE__ || '/api';

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return res.json();
}

export async function requestLogin(phone) {
  return postJson('/request-login', { phone });
}

export async function verifyToken(token) {
  return postJson('/verify-token', { token });
}

export async function updateSession(session) {
  return postJson('/update-session', { session });
}

export async function getServerQuote(input) {
  return postJson('/quote', input);
}

export async function requestCheckoutToken(orderId, sessionToken) {
  return postJson('/checkout-token', { orderId, sessionToken });
}

export async function verifyCheckoutToken(orderId, antiFraudToken, sessionToken) {
  return postJson('/verify-checkout-token', { orderId, antiFraudToken, sessionToken });
}

export async function createOrder(payload) {
  const docRef = await addDoc(collection(db, 'orders'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'CREATED',
    driverId: null,
    locked: false,
  });
  return { orderId: docRef.id };
}

export async function lockOrder(orderId, lockPayload) {
  const ref = doc(db, 'orders', orderId);
  await updateDoc(ref, {
    ...lockPayload,
    locked: true,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchOrder(orderId) {
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return null;
  return { orderId: snap.id, ...snap.data() };
}

export function subscribeOrder(orderId, cb) {
  return onSnapshot(doc(db, 'orders', orderId), (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ orderId: snap.id, ...snap.data() });
  });
}

export async function assertNoActiveOpenOrder(customerId) {
  const q = query(
    collection(db, 'orders'),
    where('customerId', '==', customerId),
    where('status', 'in', ['CREATED', 'BROADCAST', 'ACCEPTED', 'DRIVER_OTW', 'ON_TRIP']),
    orderBy('createdAt', 'desc'),
    limit(1),
  );

  const snap = await getDocs(q);
  return snap.empty;
}

export { db };
