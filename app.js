/* ============================================================
   PRISM — app.js
   ============================================================ */

/* ── Config ─────────────────────────────────────────────────── */
const MAX_HISTORY  = 30;
const STORAGE_KEY  = 'prism_history';
const API_ENDPOINT = '/.netlify/functions/chat';

/* ── State ──────────────────────────────────────────────────── */
let isLoading = false;

/* ============================================================
   CURSOR SPOTLIGHT (Raycast-style)
   Lerp-smooth following using requestAnimationFrame
   ============================================================ */
(function initSpotlight() {
  const el = document.getElementById('spotlight');
  if (!el) return;

  let mouseX = window.innerWidth  / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;
  let hasMoved = false;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!hasMoved) {
      hasMoved = true;
      el.classList.add('active');
    }
  });

  function tick() {
    /* Lerp — feel: 0.09 = buttery smooth lag */
    currentX += (mouseX - currentX) * 0.09;
    currentY += (mouseY - currentY) * 0.09;
    el.style.left = currentX + 'px';
    el.style.top  = currentY + 'px';
    requestAnimationFrame(tick);
  }
  tick();
})();

/* ============================================================
   LOCAL STORAGE MEMORY
   ============================================================ */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function setHistory(h) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); }
  catch { /* storage full */ }
}
function clearHistory() { localStorage.removeItem(STORAGE_KEY); }

/* ============================================================
   MARKDOWN RENDERING
   ============================================================ */
marked.use({ breaks: true, gfm: true });

const PURIFY_OPTS = {
  ALLOWED_TAGS: [
    'p','br','strong','em','code','pre','h1','h2','h3','h4',
    'ul','ol','li','blockquote','a','span','div',
    'table','thead','tbody','tr','th','td','hr',
  ],
  ALLOWED_ATTR: ['href','target','class','rel'],
};

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text), PURIFY_OPTS);
}

/* ============================================================
   DOM HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);

function scrollToBottom() {
  const m = $('messages');
  m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
}

function removeWelcome() { $('welcome')?.remove(); }

function setLoading(on) {
  isLoading = on;
  const btn = $('sendBtn');
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}

/* ============================================================
   RENDER MESSAGE
   ============================================================ */
function renderMessage(role, content, skipAnim = false) {
  removeWelcome();

  const msgs = $('messages');
  const row  = document.createElement('div');
  row.className = `message message-${role}`;
  if (skipAnim) row.style.animation = 'none';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (role === 'assistant') {
    bubble.innerHTML = renderMarkdown(content);
    /* Syntax highlight code blocks */
    bubble.querySelectorAll('pre code').forEach(el => {
      try { hljs.highlightElement(el); } catch { /* ignore */ }
    });
    /* Open links safely in new tab */
    bubble.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  } else {
    bubble.textContent = content;
  }

  row.appendChild(bubble);
  msgs.appendChild(row);

  if (!skipAnim) requestAnimationFrame(scrollToBottom);
  return row;
}

/* ============================================================
   TYPING INDICATOR
   ============================================================ */
function showTyping() {
  const msgs = $('messages');
  const row  = document.createElement('div');
  row.className = 'message message-assistant';
  row.id = 'typing';
  row.innerHTML = `
    <div class="bubble typing-bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>`;
  msgs.appendChild(row);
  requestAnimationFrame(scrollToBottom);
}
function hideTyping() { $('typing')?.remove(); }

/* ============================================================
   SEND MESSAGE
   ============================================================ */
async function sendMessage(raw) {
  const text = raw.trim();
  if (!text || isLoading) return;

  const input = $('userInput');
  input.value = '';
  autoResize(input);

  const history = getHistory();
  history.push({ role: 'user', content: text });
  setHistory(history);

  renderMessage('user', text);
  setLoading(true);
  showTyping();

  try {
    const res  = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: getHistory() }),
    });
    const data = await res.json();
    hideTyping();

    if (data.error) {
      renderMessage('assistant', `Something went wrong: ${data.error}`);
    } else {
      const updated = getHistory();
      updated.push({ role: 'assistant', content: data.content });
      setHistory(updated);
      renderMessage('assistant', data.content);
    }
  } catch {
    hideTyping();
    renderMessage('assistant', "Can't connect right now — check your internet and try again.");
  }

  setLoading(false);
}

/* ============================================================
   AUTO-RESIZE TEXTAREA
   ============================================================ */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

/* ============================================================
   WELCOME SCREEN HTML (rebuilt after clear)
   ============================================================ */
function welcomeHTML() {
  return `
    <div class="welcome" id="welcome">
      <div class="welcome-prism" aria-hidden="true">
        <svg viewBox="0 0 80 80" fill="none">
          <defs>
            <linearGradient id="rwL" x1="0%" y1="0%" x2="80%" y2="100%"><stop offset="0%" stop-color="#f0abfc"/><stop offset="100%" stop-color="#a855f7"/></linearGradient>
            <linearGradient id="rwR" x1="20%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient>
            <filter id="rwGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <polygon points="8,68 40,6 40,68" fill="url(#rwL)" filter="url(#rwGlow)"/>
          <polygon points="40,6 72,68 40,68" fill="url(#rwR)" filter="url(#rwGlow)" opacity="0.92"/>
          <line x1="40" y1="6" x2="40" y2="68" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
          <line x1="24" y1="16" x2="16" y2="50" stroke="rgba(255,255,255,0.18)" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="welcome-copy">
        <h1 class="welcome-heading">What do you need?</h1>
        <p class="welcome-sub">Essays · Math · Science · Coding · History</p>
      </div>
      <div class="chips" role="list">
        <button class="chip" role="listitem" data-prompt="Help me write a strong introduction for an essay about ">Write an essay</button>
        <button class="chip" role="listitem" data-prompt="Explain this concept to me simply, step by step: ">Explain anything</button>
        <button class="chip" role="listitem" data-prompt="Help me solve this step by step: ">Solve a problem</button>
        <button class="chip" role="listitem" data-prompt="Check and improve my writing: ">Improve my writing</button>
      </div>
    </div>`;
}

/* ============================================================
   BIND SUGGESTION CHIPS
   ============================================================ */
function bindChips() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input  = $('userInput');
      input.value  = chip.dataset.prompt;
      autoResize(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });
}

/* ============================================================
   SEND BUTTON RIPPLE EFFECT
   ============================================================ */
function addRipple(btn, e) {
  const existing = btn.querySelector('.ripple');
  if (existing) existing.remove();

  const r    = document.createElement('span');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;

  r.className = 'ripple';
  r.style.cssText = `
    position:absolute; border-radius:50%; pointer-events:none;
    width:${size}px; height:${size}px;
    left:${(e?.clientX ?? rect.left + rect.width/2) - rect.left - size/2}px;
    top:${(e?.clientY ?? rect.top  + rect.height/2) - rect.top  - size/2}px;
    background:rgba(255,255,255,0.3);
    transform:scale(0); animation:rippleAnim 0.5s ease-out forwards;
  `;
  btn.appendChild(r);
}

/* Inject ripple keyframes once */
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `@keyframes rippleAnim { to { transform:scale(1); opacity:0; } }`;
document.head.appendChild(rippleStyle);

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const input   = $('userInput');
  const sendBtn = $('sendBtn');
  const clearBtn = $('clearBtn');
  const wrapper  = $('inputWrapper');

  /* Restore history */
  const history = getHistory();
  if (history.length > 0) {
    history.forEach(({ role, content }) => renderMessage(role, content, true));
    scrollToBottom();
  }

  /* Textarea auto-resize */
  input.addEventListener('input', () => autoResize(input));

  /* Focus glow */
  input.addEventListener('focus', () => wrapper.classList.add('focused'));
  input.addEventListener('blur',  () => wrapper.classList.remove('focused'));

  /* Enter = send, Shift+Enter = newline */
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  /* Send button */
  sendBtn.addEventListener('click', e => {
    addRipple(sendBtn, e);
    sendMessage(input.value);
  });

  /* New chat */
  clearBtn.addEventListener('click', () => {
    if (confirm('Start a new chat? This will clear your conversation.')) {
      clearHistory();
      $('messages').innerHTML = welcomeHTML();
      bindChips();
    }
  });

  /* Initial chips */
  bindChips();

  /* Focus input on load */
  setTimeout(() => input.focus(), 100);
});
