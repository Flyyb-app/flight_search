/**

- FLYYB — js/config.js  (flight_search repo)
- 
- Single source of truth for the frontend:
- - API base URL
- - Debug logger (auto-off in production)
- - Auth token helpers
- - apiFetch() — all HTTP calls go through here
- 
- Load this FIRST before all other JS files.
  */

const FLYYB = {

// ── API target ─────────────────────────────────────────────────────────
// Points to the separate flyyb-api Vercel deployment.
// Change this if you rename or re-deploy the API project.
API_BASE: 'https://flyyb-api.vercel.app',

// ── Debug flag ──────────────────────────────────────────────────────────
// true  → console logs visible (localhost / 127.0.0.1)
// false → silent in production
DEBUG: window.location.hostname === 'localhost' ||
window.location.hostname === '127.0.0.1',

// ── Logger ──────────────────────────────────────────────────────────────
log  (a) { if (this.DEBUG) console.log ('%c[FLYYB]', 'color:#d4a843;font-weight:bold', a); },
warn (a) { if (this.DEBUG) console.warn('%c[FLYYB]', 'color:#e5ba5a;font-weight:bold', a); },
error(a) {                 console.error('%c[FLYYB]', 'color:#e8836a;font-weight:bold', a); },

// ── Auth token helpers ──────────────────────────────────────────────────
getToken ()      { return localStorage.getItem('flyyb_token'); },
setToken (token) { localStorage.setItem('flyyb_token', token); },
clearToken ()    { localStorage.removeItem('flyyb_token'); },

// ── apiFetch ────────────────────────────────────────────────────────────
/**

- Central HTTP helper for all calls to flyyb-api.
- 
- Features:
- - Attaches Authorization header automatically when a token exists
- - Logs every request/response in debug mode
- - Throws a descriptive Error on non-2xx responses
- - Distinguishes network errors from API errors
- 
- @param  {string} path     API path, e.g. '/api/search'
- @param  {object} options  Standard fetch() options (method, body, etc.)
- @returns {Promise<any>}   Parsed JSON response body
- 
- @example
- const data = await FLYYB.apiFetch('/api/search?origin=JFK&dest=LAX');
- const data = await FLYYB.apiFetch('/api/auth', {
- method: 'POST',
- body: JSON.stringify({ action: 'login', email, password }),
- });
  */
  async apiFetch(path, options = {}) {
  const url    = '${this.API_BASE}${path}';
  const method = options.method || 'GET';
  const token  = this.getToken();

this.log('→ ${method} ${path}');

const headers = {
  'Content-Type': 'application/json',
  ...(token ? { Authorization: 'Bearer ${token}' } : {}),
  ...options.headers,
};

let res, data;

try {
  res  = await fetch(url, { ...options, headers });
  data = await res.json();
} catch (networkErr) {
  this.error('✗ Network error [${path}]:', networkErr.message);
  throw new Error('Network error — check your connection and try again.');
}

if (!res.ok) {
  this.warn('← ${res.status} ${path}', data);
  throw new Error(data?.message || 'Request failed (HTTP ${res.status})');
}

this.log('← ${res.status} ${path}', data);
return data;

},
};

// Expose globally so DevTools console can inspect/toggle at runtime:
//   FLYYB.DEBUG = true    ← turn logs on in production temporarily
//   FLYYB.getToken()      ← inspect auth token
//   FLYYB.API_BASE        ← confirm which API is being called
window.FLYYB = FLYYB;