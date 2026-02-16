window.APP = window.APP || {};
window.APP.session = window.APP.session || {};

const SESSION_KEY = 'bantujeg.session.v1';

window.APP.session.save = function (token, user) {
  const sessionData = {
    token,
    user,
    savedAt: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
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
  window.location.reload();
};

window.APP.session.isAuthenticated = function () {
  const token = window.APP.session.getToken();
  return !!token;
};
