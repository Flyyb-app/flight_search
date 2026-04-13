/**

- FLYYB — js/booking.js  (flight_search repo)
- 
- Handles: multi-step booking modal — passenger forms,
- seat map, add-ons selection.
- 
- Depends on: js/config.js (FLYYB), js/auth.js (window.Auth)
- Exposes:    window.Booking  (consumed by search.js and payment.js)
  */

// ── State ─────────────────────────────────────────────────────────────────────
let activeFlight   = null;
let bookingStep    = 1;
let selectedSeats  = [];
let selectedAddons = [];
const TOTAL_STEPS  = 4;

const $ = id => document.getElementById(id);

// ── Open / close ──────────────────────────────────────────────────────────────
function openBooking(flight) {
FLYYB.log('Booking: open —', flight.id);

if (!window.Auth?.isLoggedIn()) {
FLYYB.log('Booking: not logged in, opening auth');
window.Auth?.open('login');
return;
}

activeFlight   = flight;
bookingStep    = 1;
selectedSeats  = [];
selectedAddons = [];

renderFlightSummary(flight);
goToStep(1);
$('booking-modal')?.classList.add('open');
}

function closeBooking() {
FLYYB.log('Booking: close');
$('booking-modal')?.classList.remove('open');
activeFlight = null;
}

// ── Step navigation ───────────────────────────────────────────────────────────
function goToStep(step) {
FLYYB.log('Booking: step →', step);
bookingStep = step;

document.querySelectorAll('.ps').forEach((el, i) => {
el.classList.toggle('active', i + 1 === step);
el.classList.toggle('done',   i + 1  < step);
});

document.querySelectorAll('.psec').forEach(sec =>
sec.classList.toggle('active', sec.dataset.step === String(step))
);

if (step === 2) renderSeatMap();
if (step === 3) renderAddons();
if (step === 4 && window.Payment) window.Payment.init(activeFlight, selectedAddons);
}

function nextStep() { if (validateStep(bookingStep)) goToStep(bookingStep + 1); }
function prevStep() { if (bookingStep > 1) goToStep(bookingStep - 1); }

// ── Validation ────────────────────────────────────────────────────────────────
function validateStep(step) {
clearBookingError();
if (step === 1) {
const bad = [document.querySelectorAll('.psec[data-step="1"] [required]')]
.filter(el => !el.value.trim());
bad.forEach(el => { el.style.borderColor = 'var(–rust)'; });
if (bad.length) { showBookingError('Please fill in all required fields.'); return false; }
}
if (step === 2) {
const needed = parseInt($('adults')?.value ?? 1, 10);
if (selectedSeats.length < needed) {
showBookingError(`Please select ${needed} seat${needed > 1 ? 's' : ''}.`);
return false;
}
}
return true;
}

// ── Flight summary ────────────────────────────────────────────────────────────
function renderFlightSummary(f) {
const set = (id, val) => { const el = $(id); if (el) el.textContent = val ?? '—'; };
set('fm-route',    '${f.origin} → ${f.dest}');
set('fm-airline',  f.airline);
set('fm-price',    '$${f.price}');
set('fm-dep',      f.depTime);
set('fm-arr',      f.arrTime);
set('fm-duration', f.duration);
set('fm-stops',    f.stops === 0 ? 'Nonstop' : '${f.stops} stop(s)');
set('fm-cabin',    f.cabin);
set('fm-flight',   f.flightNumber);
}

// ── Seat map ──────────────────────────────────────────────────────────────────
function renderSeatMap() {
const grid = $('seat-grid');
if (!grid) return;

const ROWS    = 20;
const COLS    = ['A', 'B', 'C', null, 'D', 'E', 'F'];
const taken   = buildTakenSet(ROWS, 0.35);
let   html    = '';

// Header row
COLS.forEach(c => { html += c ? '<div class="sg-label">${c}</div>' : '<div class="sg-gap"></div>'; });

for (let row = 1; row <= ROWS; row++) {
COLS.forEach(col => {
if (!col) { html += '<div class="sg-gap"></div>'; return; }
const id  = '${row}${col}';
const cls = taken.has(id) ? 'taken' : 'available';
html += '<div class="seat ${cls}" data-seat="${id}" data-testid="seat-${id}">${row}</div>';
});
}

grid.innerHTML = html;

grid.querySelectorAll('.seat.available').forEach(el =>
el.addEventListener('click', () => toggleSeat(el.dataset.seat, el))
);

FLYYB.log('Seat map rendered');
}

function buildTakenSet(rows, prob) {
const set  = new Set();
const cols = ['A','B','C','D','E','F'];
let   seed = 0;
for (const c of (activeFlight?.id ?? 'x')) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
for (let r = 1; r <= rows; r++)
cols.forEach((col, ci) => {
if (((seed ^ (r * 17 + ci * 7)) >>> 0) / 0xFFFFFFFF < prob) set.add('${r}${col}');
});
return set;
}

function toggleSeat(id, el) {
const max = parseInt($('adults')?.value ?? 1, 10);
if (el.classList.contains('selected')) {
el.classList.remove('selected');
selectedSeats = selectedSeats.filter(s => s !== id);
} else {
if (selectedSeats.length >= max) {
const old = selectedSeats.shift();
document.querySelector('[data-seat="${old}"]')?.classList.remove('selected');
}
el.classList.add('selected');
selectedSeats.push(id);
}
const info = $('seat-info');
if (info) info.textContent = selectedSeats.length ? `Selected: ${selectedSeats.join(', ')}` : 'Click a seat to select';
FLYYB.log('Seats:', selectedSeats);
}

// ── Add-ons ───────────────────────────────────────────────────────────────────
const ADDONS = [
{ id:'bag-23',    cat:'Baggage',    icon:'🧳', name:'23kg Checked Bag',     desc:'Standard checked bag',        price:45 },
{ id:'bag-32',    cat:'Baggage',    icon:'📦', name:'32kg Heavy Bag',        desc:'Oversized luggage',           price:70 },
{ id:'legroom',   cat:'Comfort',    icon:'💺', name:'Extra Legroom Seat',    desc:'+6 inches of legroom',        price:35 },
{ id:'meal-veg',  cat:'Meals',      icon:'🥗', name:'Vegetarian Meal',       desc:'Pre-ordered in-flight meal',  price:15 },
{ id:'meal-std',  cat:'Meals',      icon:'🍱', name:'Standard Meal',         desc:'Hot meal served on board',    price:12 },
{ id:'wifi',      cat:'Extras',     icon:'📶', name:'In-flight Wi-Fi',       desc:'Full-flight internet',        price:20 },
{ id:'priority',  cat:'Extras',     icon:'⚡', name:'Priority Boarding',     desc:'Board before all groups',     price:10 },
{ id:'insurance', cat:'Protection', icon:'🛡️', name:'Travel Insurance',      desc:'Full trip protection',        price:55 },
{ id:'lounge',    cat:'Extras',     icon:'🛋️', name:'Airport Lounge Access', desc:'Relax before your flight',    price:40 },
];

function renderAddons() {
const container = $('addons-container');
if (!container) return;

const cats = [new Set(ADDONS.map(a => a.cat))];
container.innerHTML = cats.map(cat => '<div class="addon-category"> <div class="addon-category-title">${cat}</div> ${ADDONS.filter(a => a.cat === cat).map(a =>'
<div class="addon-item" data-id="${a.id}" data-testid="addon-${a.id}">
<div class="addon-icon">${a.icon}</div>
<div class="addon-info">
<div class="addon-name">${a.name}</div>
<div class="addon-desc">${a.desc}</div>
</div>
<div class="addon-price">+$${a.price}</div>
<div class="addon-check"></div>
</div>').join('')} </div>').join('');

container.querySelectorAll('.addon-item').forEach(el =>
el.addEventListener('click', () => toggleAddon(el.dataset.id, el))
);
}

function toggleAddon(id, el) {
const addon = ADDONS.find(a => a.id === id);
if (!addon) return;
if (el.classList.contains('selected')) {
el.classList.remove('selected');
selectedAddons = selectedAddons.filter(a => a.id !== id);
} else {
el.classList.add('selected');
selectedAddons.push(addon);
}
FLYYB.log('Add-ons:', selectedAddons.map(a => a.name));
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function showBookingError(msg) {
const el = $('booking-error');
if (el) { el.textContent = msg; el.classList.add('on'); }
FLYYB.warn('Booking:', msg);
}
function clearBookingError() {
const el = $('booking-error');
if (el) { el.textContent = ''; el.classList.remove('on'); }
}

// ── Public API ────────────────────────────────────────────────────────────────
window.Booking = {
open:       openBooking,
close:      closeBooking,
getFlight:  () => activeFlight,
getSeats:   () => selectedSeats,
getAddons:  () => selectedAddons,
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function initBooking() {
FLYYB.log('booking.js ready');
$('booking-modal-close')?.addEventListener('click', closeBooking);
document.querySelectorAll('[data-action="next-step"]').forEach(b => b.addEventListener('click', nextStep));
document.querySelectorAll('[data-action="prev-step"]').forEach(b => b.addEventListener('click', prevStep));
});