/**

- FLYYB — js/auth.js  (flight_search repo)
- 
- Handles all authentication UI:
- login · register · OTP · session restore · session expiry warning
- 
- Calls: POST /api/auth  (flyyb-api)
- Calls: GET  /api/profiles  (flyyb-api — session restore)
- 
- Depends on: js/config.js  (FLYYB global must load first)
- Exposes:    window.Auth
  */

// ── Module state ────────────────────────────────────────────────────────────
let currentUser  = null;
let sessionTimer = null;
const SESSION_WARNING_MS = 28 * 60 * 1000; // warn 2 min before 30-min JWT expiry

// ── Small helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showMsg(el, text, type = 'error') {
if (!el) return;
el.textContent = text;
el.className = type === 'ok' ? 'msg-ok on' : 'msg-err on';
}

function clearMsg(el) {
if (!el) return;
el.textContent = '';
el.classList.remove('on');
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openAuthModal(tab = 'login') {
FLYYB.log('Auth: open modal →', tab);
$('auth-modal')?.classList.add('open');
switchTab(tab);
}

function closeAuthModal() {
FLYYB.log('Auth: close modal');
$('auth-modal')?.classList.remove('open');
}

function switchTab(tab) {
document.querySelectorAll('.auth-tab').forEach(btn =>
btn.classList.toggle('active', btn.dataset.tab === tab)
);
document.querySelectorAll('.auth-section').forEach(sec =>
sec.classList.toggle('active', sec.dataset.section === tab)
);
}

// ── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
e.preventDefault();
const err   = $('login-error');
const email = $('login-email')?.value.trim();
const pass  = $('login-password')?.value;

clearMsg(err);
if (!email || !pass) return showMsg(err, 'Please enter your email and password.');

try {
const data = await FLYYB.apiFetch('/api/auth', {
method: 'POST',
body: JSON.stringify({ action: 'login', email, password: pass }),
});
FLYYB.setToken(data.token);
currentUser = data.user;
onAuthSuccess(data.user);
closeAuthModal();
} catch (ex) {
showMsg(err, ex.message);
}
}

// ── Register ─────────────────────────────────────────────────────────────────
async function handleRegister(e) {
e.preventDefault();
const err       = $('register-error');
const ok        = $('register-ok');
const firstName = $('reg-firstname')?.value.trim();
const lastName  = $('reg-lastname')?.value.trim();
const email     = $('reg-email')?.value.trim();
const password  = $('reg-password')?.value;

clearMsg(err); clearMsg(ok);
if (!firstName || !lastName || !email || !password)
return showMsg(err, 'All fields are required.');
if (password.length < 8)
return showMsg(err, 'Password must be at least 8 characters.');

try {
const data = await FLYYB.apiFetch('/api/auth', {
method: 'POST',
body: JSON.stringify({ action: 'register', firstName, lastName, email, password }),
});
FLYYB.setToken(data.token);
currentUser = data.user;
showMsg(ok, 'Account created! Welcome to FLYYB.', 'ok');
setTimeout(() => { onAuthSuccess(data.user); closeAuthModal(); }, 1200);
} catch (ex) {
showMsg(err, ex.message);
}
}

// ── OTP ──────────────────────────────────────────────────────────────────────
async function handleSendOtp() {
const err   = $('otp-error');
const phone = $('otp-phone')?.value.trim();
clearMsg(err);
if (!phone) return showMsg(err, 'Please enter your phone number.');

try {
await FLYYB.apiFetch('/api/auth', {
method: 'POST',
body: JSON.stringify({ action: 'sendOtp', phone }),
});
$('otp-send-btn')?.style && ($('otp-send-btn').style.display = 'none');
$('otp-verify-section')?.style && ($('otp-verify-section').style.display = 'block');
FLYYB.log('Auth: OTP sent to', phone);
} catch (ex) {
showMsg(err, ex.message);
}
}

async function handleVerifyOtp() {
const err   = $('otp-error');
const phone = $('otp-phone')?.value.trim();
const code  = […document.querySelectorAll('.otp-i')].map(i => i.value).join('');
clearMsg(err);
if (code.length < 6) return showMsg(err, 'Please enter the full 6-digit code.');

try {
const data = await FLYYB.apiFetch('/api/auth', {
method: 'POST',
body: JSON.stringify({ action: 'verifyOtp', phone, code }),
});
FLYYB.setToken(data.token);
currentUser = data.user;
onAuthSuccess(data.user);
closeAuthModal();
} catch (ex) {
showMsg(err, ex.message);
}
}

// ── Logout ───────────────────────────────────────────────────────────────────
function handleLogout() {
FLYYB.log('Auth: logout');
FLYYB.clearToken();
currentUser = null;
clearSessionTimer();
renderUserPill(null);
$('user-dropdown')?.classList.remove('open');
}

// ── Post-auth UI ─────────────────────────────────────────────────────────────
function onAuthSuccess(user) {
FLYYB.log('Auth: success —', user.email);
renderUserPill(user);
startSessionTimer();
}

function renderUserPill(user) {
const pill = $('user-pill');
if (!pill) return;
if (user) {
const initials = '${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}'.toUpperCase();
pill.innerHTML = ' <div class="user-avatar" data-testid="user-avatar">${initials}</div> <span class="user-name"  data-testid="user-name">${user.firstName}</span>';
pill.dataset.loggedIn = 'true';
} else {
pill.innerHTML = '<span class="user-name">Sign In</span>';
pill.dataset.loggedIn = 'false';
}
}

// ── Session management ────────────────────────────────────────────────────────
function startSessionTimer() {
clearSessionTimer();
sessionTimer = setTimeout(showSessionWarning, SESSION_WARNING_MS);
FLYYB.log('Auth: session timer started');
}

function clearSessionTimer() {
if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
}

function showSessionWarning() {
$('session-banner')?.classList.add('show');
}

function extendSession() {
$('session-banner')?.classList.remove('show');
startSessionTimer();
FLYYB.log('Auth: session extended');
}

// ── Auto-restore on page load ─────────────────────────────────────────────────
async function restoreSession() {
if (!FLYYB.getToken()) return;
FLYYB.log('Auth: restoring session from token');
try {
const data = await FLYYB.apiFetch('/api/profiles');
currentUser = data.user;
onAuthSuccess(data.user);
} catch (ex) {
FLYYB.warn('Auth: restore failed —', ex.message);
FLYYB.clearToken();
}
}

// ── OTP digit auto-advance ────────────────────────────────────────────────────
function initOtpInputs() {
const inputs = […document.querySelectorAll('.otp-i')];
inputs.forEach((inp, i) => {
inp.addEventListener('input', () => {
if (inp.value.length === 1 && i < inputs.length - 1) inputs[i + 1].focus();
});
inp.addEventListener('keydown', e => {
if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
});
});
}

// ── Public API ────────────────────────────────────────────────────────────────
window.Auth = {
open:      openAuthModal,
close:     closeAuthModal,
logout:    handleLogout,
isLoggedIn: () => !!currentUser,
getUser:   () => currentUser,
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function initAuth() {
FLYYB.log('auth.js ready');

initOtpInputs();
restoreSession();

// Tabs
document.querySelectorAll('.auth-tab').forEach(btn =>
btn.addEventListener('click', () => switchTab(btn.dataset.tab))
);

// Forms
$('login-form')?.addEventListener('submit', handleLogin);
$('register-form')?.addEventListener('submit', handleRegister);

// OTP
$('otp-send-btn')?.addEventListener('click', handleSendOtp);
$('otp-verify-btn')?.addEventListener('click', handleVerifyOtp);

// Modal close
$('auth-modal-close')?.addEventListener('click', closeAuthModal);

// User pill
$('user-pill')?.addEventListener('click', () => {
if (currentUser) $('user-dropdown')?.classList.toggle('open');
else openAuthModal('login');
});

// Logout
$('logout-btn')?.addEventListener('click', handleLogout);

// Session banner
$('session-extend-btn')?.addEventListener('click', extendSession);

// Close dropdown on outside click
document.addEventListener('click', e => {
const pill = $('user-pill');
const dd   = $('user-dropdown');
if (dd && pill && !pill.contains(e.target) && !dd.contains(e.target))
dd.classList.remove('open');
});
});