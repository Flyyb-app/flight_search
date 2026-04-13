/**

- FLYYB — js/payment.js  (flight_search repo)
- 
- Handles: Stripe card element, FLYYB credits toggle,
- booking summary, payment submission, success screen.
  
- 
- Stripe publishable key strategy:
- Fetched from GET /api/config (flyyb-api) at runtime.
- Never hardcoded in HTML or JS source — kept entirely in Vercel env vars.
- 
- Calls: GET  /api/config                    (flyyb-api — Stripe key)
- Calls: GET  /api/profiles?section=credits  (flyyb-api)
- Calls: POST /api/booking                   (flyyb-api)
- 
- Depends on: js/config.js (FLYYB), js/booking.js (window.Booking)
- Exposes:    window.Payment
  */

// ── State ─────────────────────────────────────────────────────────────────────
let stripe         = null;
let cardElement    = null;
let creditsApplied = false;
let userCredits    = 0;

const $ = id => document.getElementById(id);

// ── Entry point (called by booking.js when step 4 is reached) ─────────────────
async function initPayment(flight, addons) {
FLYYB.log('Payment: init — flight', flight.id, '| addons', addons.length);
renderSummary(flight, addons);
await Promise.all([fetchCredits(), mountStripe()]);
}

// ── Stripe setup — key fetched from API env var, not hardcoded ────────────────
async function mountStripe() {
if (typeof Stripe === 'undefined') {
FLYYB.error('Payment: Stripe.js not loaded — check <script src="https://js.stripe.com/v3/" defer> in index.html');
showPayError('Payment unavailable. Please refresh the page.');
return;
}

// Fetch the publishable key from the API (stored in Vercel env: STRIPE_PUBLISHABLE_KEY)
let publishableKey;
try {
const cfg = await FLYYB.apiFetch('/api/config');
publishableKey = cfg.stripePublishableKey;
FLYYB.log('Payment: Stripe env —', cfg.environment);
} catch (ex) {
FLYYB.error('Payment: could not fetch /api/config —', ex.message);
showPayError('Payment configuration unavailable. Please try again.');
return;
}

if (!publishableKey || !publishableKey.startsWith('pk_')) {
FLYYB.error('Payment: invalid Stripe publishable key received from /api/config');
showPayError('Payment configuration error. Please contact support.');
return;
}

stripe = Stripe(publishableKey);

const elements = stripe.elements({
appearance: {
theme: 'night',
variables: {
colorPrimary:    '#d4a843',
colorBackground: 'rgba(255,255,255,0.05)',
colorText:       '#f5f0e8',
fontFamily:      'DM Sans, sans-serif',
borderRadius:    '2px',
},
},
});

cardElement = elements.create('card');
cardElement.mount('#stripe-card-element');

cardElement.on('change', ev => {
const el = $('stripe-card-errors');
if (el) el.textContent = ev.error?.message ?? '';
});

FLYYB.log('Payment: Stripe card element mounted');
}

// ── Booking summary ───────────────────────────────────────────────────────────
function renderSummary(flight, addons) {
const base        = flight.price;
const addonsTotal = addons.reduce((s, a) => s + a.price, 0);
const taxes       = Math.round(base * 0.12);
const discount    = creditsApplied ? Math.min(userCredits, base) : 0;
const total       = base + addonsTotal + taxes - discount;

const rows = [
{ label: '${flight.airline} · ${flight.origin}→${flight.dest}', val: '$${base}' },
addons.map(a => ({ label: a.name, val: '+$${a.price}' })),
{ label: 'Taxes & fees (12%)', val: '$${taxes}' },
(discount > 0 ? [{ label: 'FLYYB Credits', val: '-$${discount}' }] : []),
];

const el = $('booking-summary');
if (!el) return;

el.innerHTML = rows.map(r => ' <div class="sum-row"> <span class="sum-lbl">${r.label}</span> <span class="sum-val">${r.val}</span> </div>').join('') + ' <div class="sum-row sum-total"> <span class="sum-lbl">Total</span> <span class="sum-val">$${total}</span> </div>';

// Store for payment submission
el.dataset.total = total;
FLYYB.log('Payment: summary total — $' + total);
}

// ── Credits ───────────────────────────────────────────────────────────────────
async function fetchCredits() {
try {
const data  = await FLYYB.apiFetch('/api/profiles?section=credits');
userCredits = data.credits ?? 0;


const display = $('credits-balance-display');
if (display) display.textContent = userCredits;

const section = $('credits-apply-section');
if (section) section.style.display = userCredits > 0 ? 'flex' : 'none';

FLYYB.log('Payment: credits available —', userCredits);


} catch (ex) {
FLYYB.warn('Payment: could not load credits —', ex.message);
}
}

function toggleCredits() {
creditsApplied = !creditsApplied;
const btn = $('credits-toggle-btn');
if (btn) {
btn.textContent = creditsApplied ? 'Remove' : 'Apply';
btn.classList.toggle('active', creditsApplied);
}
// Re-render summary with updated discount
const { getFlight, getAddons } = window.Booking ?? {};
if (getFlight && getAddons) renderSummary(getFlight(), getAddons());
FLYYB.log('Payment: credits applied —', creditsApplied);
}

// ── Submit payment ────────────────────────────────────────────────────────────
async function handlePay() {
if (!stripe || !cardElement) {
showPayError('Payment not ready. Please refresh the page.');
return;
}

const total = parseInt($('booking-summary')?.dataset?.total ?? 0, 10);
if (!total || total < 1) {
showPayError('Invalid booking total. Please go back and try again.');
return;
}

FLYYB.log('Payment: submitting — $' + total);
setProcessing(true);

try {
// Step 1 — Create PaymentIntent on the server
const { clientSecret, bookingRef } = await FLYYB.apiFetch('/api/booking', {
method: 'POST',
body: JSON.stringify({
flightId:      window.Booking.getFlight().id,
seats:         window.Booking.getSeats(),
addons:        window.Booking.getAddons().map(a => a.id),
creditsApplied,
totalCents:    total * 100,
}),
});


// Step 2 — Confirm card payment via Stripe (client-side)
const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: { card: cardElement },
});

if (error) {
  FLYYB.warn('Payment: Stripe declined —', error.message);
  showPayError(error.message);
  return;
}

// Step 3 — Success
FLYYB.log('Payment: confirmed — booking ref', bookingRef);
showSuccess(bookingRef);


} catch (ex) {
FLYYB.error('Payment: failed —', ex.message);
showPayError(ex.message);
} finally {
setProcessing(false);
}
}

// ── UI state helpers ──────────────────────────────────────────────────────────
function setProcessing(on) {
$('processing-overlay')?.classList.toggle('active', on);
const btn = $('pay-btn');
if (btn) btn.disabled = on;
}

function showSuccess(ref) {
const refEl = $('booking-ref');
if (refEl) refEl.textContent = ref;
const success = $('payment-success');
const form    = $('payment-form');
if (success) success.style.display = 'block';
if (form)    form.style.display    = 'none';
}

function showPayError(msg) {
const el = $('payment-error');
if (el) { el.textContent = msg; el.classList.add('on'); }
FLYYB.warn('Payment error:', msg);
}

// ── Public API ────────────────────────────────────────────────────────────────
window.Payment = { init: initPayment };

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function initPaymentListeners() {
FLYYB.log('payment.js ready');
$('pay-btn')?.addEventListener('click', handlePay);
$('credits-toggle-btn')?.addEventListener('click', toggleCredits);
});