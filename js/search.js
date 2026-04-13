/**

- FLYYB — js/search.js  (flight_search repo)
- 
- Handles: airport autocomplete, trip-type tabs, search form,
- flight result cards, swap button.
- 
- Calls: GET /api/search?type=airports  (flyyb-api)
- Calls: GET /api/search?type=flights   (flyyb-api)
- 
- Depends on: js/config.js (FLYYB), js/booking.js (window.Booking)
  */

// ── Utilities ─────────────────────────────────────────────────────────────────
function debounce(fn, ms = 300) {
let t;
return (args) => { clearTimeout(t); t = setTimeout(() => fn(args), ms); };
}

// ── Module state ──────────────────────────────────────────────────────────────
let selectedOrigin = null;
let selectedDest   = null;
let tripType       = 'round';

// ── DOM helper ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Airport autocomplete ──────────────────────────────────────────────────────
function makeAutocomplete(inputId, dropdownId, onSelect) {
const input    = $(inputId);
const dropdown = $(dropdownId);
if (!input || !dropdown) return;

input.addEventListener('input', debounce(async () => {
const q = input.value.trim();
if (q.length < 2) { dropdown.classList.remove('open'); return; }


let airports = [];
try {
  const data = await FLYYB.apiFetch('/api/search?type=airports&q=${encodeURIComponent(q)}');
  airports = data.airports ?? [];
} catch (ex) {
  FLYYB.warn('Autocomplete error:', ex.message);
  return;
}

if (!airports.length) { dropdown.classList.remove('open'); return; }

dropdown.innerHTML = airports.map(ap => `
  <div class="ap-item" data-code="${ap.iata}" data-testid="ap-item">
    <div class="ap-item-left">
      <span class="ap-item-name">${ap.name}</span>
      <span class="ap-item-city">${ap.city}, ${ap.country}</span>
    </div>
    <span class="ap-item-code">${ap.iata}</span>
  </div>`).join('');

dropdown.querySelectorAll('.ap-item').forEach(item => {
  item.addEventListener('click', () => {
    const ap = airports.find(a => a.iata === item.dataset.code);
    input.value = '${ap.city} (${ap.iata})';
    dropdown.classList.remove('open');
    onSelect(ap);
    FLYYB.log('Airport selected:', ap.iata);
  });
});

dropdown.classList.add('open');


}, 300));

// Close on outside click
document.addEventListener('click', e => {
if (!dropdown.contains(e.target) && e.target !== input)
dropdown.classList.remove('open');
});
}

// ── Swap ──────────────────────────────────────────────────────────────────────
function handleSwap() {
const o = $('origin-input');
const d = $('dest-input');
if (!o || !d) return;
[o.value, d.value]         = [d.value, o.value];
[selectedOrigin, selectedDest] = [selectedDest, selectedOrigin];
FLYYB.log('Swapped:', selectedOrigin?.iata, '↔', selectedDest?.iata);
}

// ── Trip type tabs ────────────────────────────────────────────────────────────
function handleTripTab(tab) {
tripType = tab;
document.querySelectorAll('.trip-tab').forEach(btn =>
btn.classList.toggle('active', btn.dataset.trip === tab)
);
const retWrap = $('return-date-wrap');
if (retWrap) retWrap.style.display = tab === 'oneway' ? 'none' : '';
FLYYB.log('Trip type:', tripType);
}

// ── Search submit ─────────────────────────────────────────────────────────────
async function handleSearch() {
clearSearchError();

if (!selectedOrigin)  return showSearchError('Please select a departure airport.');
if (!selectedDest)    return showSearchError('Please select a destination airport.');
if (!$('dep-date')?.value) return showSearchError('Please select a departure date.');
if (tripType === 'round' && !$('ret-date')?.value)
return showSearchError('Please select a return date.');

showLoadingBar(true);

const params = new URLSearchParams({
type:   'flights',
origin: selectedOrigin.iata,
dest:   selectedDest.iata,
date:   $('dep-date').value,
adults: $('adults')?.value  ?? 1,
cabin:  $('cabin')?.value   ?? 'economy',
($('ret-date')?.value ? { retDate: $('ret-date').value } : {}),
});

try {
const data = await FLYYB.apiFetch('/api/search?${params}');
renderResults(data.flights ?? []);
} catch (ex) {
showSearchError('Search failed: ${ex.message}');
} finally {
showLoadingBar(false);
}
}

// ── Results ───────────────────────────────────────────────────────────────────
function renderResults(flights) {
const section   = $('results-section');
const container = $('results-container');
const countEl   = $('results-count');

if (!section || !container) { FLYYB.warn('Results elements missing'); return; }

if (countEl) countEl.textContent = '${flights.length} flight${flights.length !== 1 ? 's' : ''} found';

if (!flights.length) {
container.innerHTML = '<div class="empty-hero" data-testid="no-results"> <p>No flights found. Try different dates or airports.</p></div>';
section.classList.add('visible');
return;
}

container.innerHTML = '';
flights.forEach((f, i) => {
const card = buildCard(f, i === 0);
container.appendChild(card);
requestAnimationFrame(() => setTimeout(() => card.classList.add('revealed'), i * 60));
});

section.classList.add('visible');
section.scrollIntoView({ behavior: 'smooth', block: 'start' });
FLYYB.log('Results rendered:', flights.length);
}

function buildCard(f, isBest) {
const card = document.createElement('div');
card.className = 'flight-card${isBest ? ' best' : ''}';
card.dataset.testid  = 'flight-card';
card.dataset.flightId = f.id;

const stops = f.stops === 0
? '<span class="stops-label nonstop">Nonstop</span>'
: '<span class="stops-label">${f.stops} stop${f.stops > 1 ? 's' : ''}</span>';

card.innerHTML = '${isBest ? '<span class="badge">Best value</span>' : ''} <div class="airline-logo">${f.airlineCode} <div class="airline-name">${f.airline}</div> </div> <div class="route-info"> <div class="time-block"> <div class="time">${f.depTime}</div> <div class="time-airport">${f.origin}</div> </div> <div class="flight-line"> <div class="duration">${f.duration}</div> <div class="line-container"> <div class="line-dot"></div> <div class="line-bar">${stops}</div> <div class="line-dot"></div> </div> </div> <div class="time-block"> <div class="time">${f.arrTime}</div> <div class="time-airport">${f.dest}</div> </div> </div> <div class="extras"> <div class="cabin-lbl">${f.cabin}</div> ${f.seatsLeft <= 5 ?'<div class="seats-left">${f.seatsLeft} seats left</div>' : ''} </div> <div class="price-col"> <div class="price">$${f.price}</div> <div class="price-label">per person</div> <button class="select-btn" type="button" data-testid="select-flight">Select</button> </div>';

const onSelect = () => {
if (window.Booking) window.Booking.open(f);
else FLYYB.warn('booking.js not loaded yet');
};

card.querySelector('.select-btn').addEventListener('click', e => { e.stopPropagation(); onSelect(); });
card.addEventListener('click', onSelect);
return card;
}

// ── Loading / error helpers ────────────────────────────────────────────────────
function showLoadingBar(on) { $('loading-bar')?.classList.toggle('active', on); }

function showSearchError(msg) {
const el = $('search-error');
if (el) { el.textContent = msg; el.classList.add('on'); }
FLYYB.warn('Search:', msg);
}

function clearSearchError() {
const el = $('search-error');
if (el) { el.textContent = ''; el.classList.remove('on'); }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function initSearch() {
FLYYB.log('search.js ready');

makeAutocomplete('origin-input', 'origin-dropdown', ap => { selectedOrigin = ap; });
makeAutocomplete('dest-input',   'dest-dropdown',   ap => { selectedDest   = ap; });

$('swap-btn')?.addEventListener('click', handleSwap);
$('search-btn')?.addEventListener('click', handleSearch);

document.querySelectorAll('.trip-tab').forEach(btn =>
btn.addEventListener('click', () => handleTripTab(btn.dataset.trip))
);
});