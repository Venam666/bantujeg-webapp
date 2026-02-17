const initialState = {
  pickup: null,
  dropoff: null,
  serviceType: 'RIDE',
  paymentMethod: '',
  pricing: {
    config: null,
    available: false,
    estimate: null,
    error: null,
  },
  orderStatus: {
    activeOrderId: null,
    status: null,
    paymentStatus: null,
    qrisCountdownSeconds: 600,
    qrisConfirmLocked: false,
  },
};

const listeners = new Set();
const state = structuredClone(initialState);

function getState() {
  return state;
}

function setState(patch) {
  if (!patch || typeof patch !== 'object') return;
  Object.assign(state, patch);
  listeners.forEach((cb) => cb(state));
}

function updateState(mutator) {
  if (typeof mutator !== 'function') return;
  mutator(state);
  listeners.forEach((cb) => cb(state));
}

function subscribe(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const runtimeState = {
  getState,
  setState,
  updateState,
  subscribe,
};

window.RUNTIME = window.RUNTIME || {};
window.RUNTIME.state = runtimeState;
