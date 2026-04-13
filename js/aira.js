/**

- FLYYB — js/aira.js  (flight_search repo)
- 
- AI chatbot — lazy loaded on first button click.
- NOT included in the initial page bundle.
- 
- Calls: POST /api/chat  (flyyb-api)
- 
- Depends on: js/config.js (FLYYB)
- Exposes:    window.Aira
  */

// ── State ─────────────────────────────────────────────────────────────────────
let history  = [];   // [{ role, content }]
let busy     = false;

const $ = id => document.getElementById(id);

// ── Open / close ──────────────────────────────────────────────────────────────
function openAira() {
FLYYB.log('Aira: open');
$('aira-panel')?.classList.add('open');
if (!history.length) greet();
$('aira-input')?.focus();
}

function closeAira() {
FLYYB.log('Aira: close');
$('aira-panel')?.classList.remove('open');
}

function greet() {
addBubble('assistant',
"Hi! I'm Aira ✈️  I can help you find flights, compare prices, or answer travel questions. What can I help you with?"
);
}

// ── Send ──────────────────────────────────────────────────────────────────────
async function send() {
if (busy) return;
const input = $('aira-input');
const text  = input?.value?.trim();
if (!text) return;

input.value = '';
addBubble('user', text);
history.push({ role: 'user', content: text });
await getReply(text);
}

async function getReply(text) {
busy = true;
typing(true);
FLYYB.log('Aira: →', text.slice(0, 60));

try {
const data = await FLYYB.apiFetch('/api/chat', {
method: 'POST',
body: JSON.stringify({ message: text, history: history.slice(-10) }),
});
const reply = data.reply ?? 'Sorry, I didnt get a response. Please try again.';
history.push({ role: 'assistant', content: reply });
addBubble('assistant', reply);
FLYYB.log('Aira: ←', reply.slice(0, 60));
} catch (ex) {
FLYYB.error('Aira: API error —', ex.message);
addBubble('assistant', 'Sorry, I am having trouble connecting. (${ex.message})');
} finally {
busy = false;
typing(false);
}
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function addBubble(role, text) {
const msgs = $('aira-messages');
if (!msgs) return;
const div = document.createElement('div');
div.className = 'aira-bubble aira-${role}';
div.dataset.testid = 'aira-${role}';
div.textContent = text;          // textContent — safe against XSS
msgs.appendChild(div);
msgs.scrollTop = msgs.scrollHeight;
}

function typing(show) {
let el = $('aira-typing');
if (!el) {
el = document.createElement('div');
el.id        = 'aira-typing';
el.className = 'aira-bubble aira-assistant aira-typing-indicator';
el.innerHTML = '<span></span><span></span><span></span>';
$('aira-messages')?.appendChild(el);
}
el.style.display = show ? 'flex' : 'none';
}

function clearChat() {
history = [];
const msgs = $('aira-messages');
if (msgs) msgs.innerHTML = '';
greet();
FLYYB.log('Aira: chat cleared');
}

// ── Public API ────────────────────────────────────────────────────────────────
window.Aira = { open: openAira, close: closeAira };

// ── Init — runs immediately since this script is lazy-loaded after DOM ready ──
(function initAira() {
FLYYB.log('aira.js ready (lazy loaded)');
$('aira-close')?.addEventListener('click', closeAira);
$('aira-clear')?.addEventListener('click', clearChat);
$('aira-send')?.addEventListener('click', send);
$('aira-input')?.addEventListener('keydown', e => {
if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
openAira();
})();