window.APP = window.APP || {};
window.APP.session = window.APP.session || {};

const SESSION_KEY = 'bantujeg.session.v1';
const IDENTITY_KEY = 'bantujeg.identity.v1';

function normalizePhone(input) {
  if (!input) return '';
  let value = String(input).replace(/\D/g, '');
  if (value.startsWith('0')) value = `62${value.slice(1)}`;
  if (value.startsWith('8')) value = `62${value}`;
  return value;
}

function generateSessionKey() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getIdentityRaw() {
  const raw = localStorage.getItem(IDENTITY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

window.APP.session.save = function (token, user) {
  const sessionData = {
    token,
    user,
    savedAt: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

  const phone = normalizePhone(user?.phone || user?.phoneNumber || user?.customer_phone || '');
  const existing = getIdentityRaw();
  const identity = {
    sessionKey: existing?.sessionKey || generateSessionKey(),
    phone: phone || existing?.phone || '',
    updatedAt: Date.now(),
  };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
};

window.APP.session.getToken = function () {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.token;
  } catch {
    return null;
  }
};

window.APP.session.getUser = function () {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.user;
  } catch {
    return null;
  }
};

window.APP.session.logout = function () {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(IDENTITY_KEY);
  window.location.reload();
};

window.APP.session.isAuthenticated = function () {
  const token = window.APP.session.getToken();
  const identity = getIdentityRaw();
  return !!(token || (identity?.sessionKey && identity?.phone));
};

window.APP.session.getIdentity = function () {
  const identity = getIdentityRaw();
  if (!identity) return null;
  return {
    sessionKey: identity.sessionKey || '',
    phone: normalizePhone(identity.phone || ''),
  };
};

window.APP.session.setIdentity = function (phone, sessionKey = null) {
  const identity = {
    sessionKey: sessionKey || generateSessionKey(),
    phone: normalizePhone(phone),
    updatedAt: Date.now(),
  };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
};
