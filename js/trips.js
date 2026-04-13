/**

- FLYYB — js/trips.js  (flight_search repo)
- 
- Handles: My Trips modal — load, render, filter, cancel.
- 
- Calls: GET  /api/trips               (flyyb-api)
- Calls: POST /api/trips (action=cancel) (flyyb-api)
- 
- Depends on: js/config.js (FLYYB), js/auth.js (window.Auth)
- Exposes:    window.Trips
  */

// ── State ─────────────────────────────────────────────────────────────────────
let allTrips     = [];
let activeFilter = 'all';

const $ = id => document.getElementById(id);

// ── Open / close ──────────────────────────────────────────────────────────────
async function openTrips() {
if (!window.Auth?.isLoggedIn()) { window.Auth?.open('login'); return; }
FLYYB.log('Trips: open');
$('trips-modal')?.classList.add('open');
await loadTrips();
}

function closeTrips() {
FLYYB.log('Trips: close');
$('trips-modal')?.classList.remove('open');
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadTrips() {
const c = $('trips-container');
if (!c) return;
c.innerHTML = '<div style="padding:20px;color:rgba(245,240,232,.4)">Loading trips</div>';

try {
const data = await FLYYB.apiFetch('/api/trips');
allTrips = data.trips ?? [];
FLYYB.log('Trips: loaded', allTrips.length);
renderTrips(activeFilter);
} catch (ex) {
c.innerHTML = '<div class="msg-err on">Could not load trips: ${ex.message}</div>';
FLYYB.error('Trips: load failed —', ex.message);
}
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTrips(filter) {
activeFilter = filter;
const c = $('trips-container');
if (!c) return;

document.querySelectorAll('.trip-filter').forEach(btn =>
btn.classList.toggle('active', btn.dataset.filter === filter)
);

const list = filter === 'all' ? allTrips : allTrips.filter(t => t.status === filter);

if (!list.length) {
c.innerHTML = `<div class="empty-hero" data-testid="no-trips"> <p>No ${filter === 'all' ? '' : filter + ' '}trips found.</p></div>`;
return;
}

c.innerHTML = list.map(t => {
const dateStr = new Date(t.departureDate).toLocaleDateString('en-US',
{ weekday:'short', month:'short', day:'numeric', year:'numeric' });


return '
  <div class="trip-card" data-testid="trip-card">
    <div class="trip-card-header">
      <div>
        <div class="trip-ref">${t.bookingRef}</div>
        <div style="font-size:.7rem;color:rgba(245,240,232,.4);margin-top:3px">${dateStr}</div>
      </div>
      <div class="trip-status ${t.status}">${t.status}</div>
    </div>
    <div><strong>${t.origin}</strong> → <strong>${t.dest}</strong>
      <span style="margin-left:10px;font-size:.75rem;color:rgba(245,240,232,.4)">${t.airline}</span>
    </div>
    <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-family:'DM Mono',monospace;color:var(--gold)">$${t.totalPaid}</span>
      ${t.status === 'confirmed' ? '
        <button type="button" class="p-back"
          style="flex:0;padding:7px 16px;font-size:.72rem"
          data-action="cancel-trip" data-trip-id="${t.id}">Cancel</button>' : ''}
    </div>
  </div>';


}).join('');

c.querySelectorAll('[data-action="cancel-trip"]').forEach(btn =>
btn.addEventListener('click', e => { e.stopPropagation(); confirmCancel(btn.dataset.tripId); })
);
}

// ── Cancel ────────────────────────────────────────────────────────────────────
function confirmCancel(tripId) {
const overlay = $('confirm-overlay');
const ok      = $('confirm-ok');
const cancel  = $('confirm-cancel');

if (!overlay) {
if (window.confirm('Cancel this booking? This cannot be undone.')) executeCancel(tripId);
return;
}

overlay.classList.add('open');

function done() { overlay.classList.remove('open'); ok.removeEventListener('click', onOk); cancel.removeEventListener('click', done); }
function onOk() { done(); executeCancel(tripId); }

ok?.addEventListener('click', onOk);
cancel?.addEventListener('click', done);
}

async function executeCancel(tripId) {
FLYYB.log('Trips: cancel —', tripId);
try {
await FLYYB.apiFetch('/api/trips', {
method: 'POST',
body: JSON.stringify({ action: 'cancel', tripId }),
});
allTrips = allTrips.map(t => t.id === tripId ? { t, status: 'cancelled' } : t);
renderTrips(activeFilter);
FLYYB.log('Trips: cancelled —', tripId);
} catch (ex) {
FLYYB.error('Trips: cancel failed —', ex.message);
alert('Could not cancel booking: ${ex.message}');
}
}

// ── Public API ────────────────────────────────────────────────────────────────
window.Trips = { open: openTrips, close: closeTrips };

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function initTrips() {
FLYYB.log('trips.js ready');
$('trips-modal-close')?.addEventListener('click', closeTrips);
document.querySelectorAll('.trip-filter').forEach(btn =>
btn.addEventListener('click', () => renderTrips(btn.dataset.filter))
);
document.querySelector('[data-nav="trips"]')?.addEventListener('click', openTrips);
});