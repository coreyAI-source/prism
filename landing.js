/* ============================================================
   PRISM — landing.js
   Landing page interactivity:
   - Cursor spotlight (Raycast-style lerp)
   - 3D card tilt + moving specular highlight (Apple-style)
   - Scroll reveal (Intersection Observer)
   - Animated chat preview (typewriter)
   - Button ripple effects
   ============================================================ */

/* ============================================================
   CURSOR SPOTLIGHT  (smooth lerp follow)
   ============================================================ */
(function initSpotlight() {
  const el = document.getElementById('spotlight');
  if (!el) return;

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let cx = mx, cy = my;
  let active = false;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!active) { active = true; el.classList.add('active'); }
  });

  (function tick() {
    cx += (mx - cx) * 0.09;
    cy += (my - cy) * 0.09;
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    requestAnimationFrame(tick);
  })();
})();

/* ============================================================
   3D CARD TILT + MOVING SPECULAR HIGHLIGHT
   Each .feature-card responds to mouse within it
   ============================================================ */
document.querySelectorAll('[data-tilt]').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;   // 0 → 1
    const y = (e.clientY - r.top)  / r.height;  // 0 → 1
    const rx =  (y - 0.5) * -16;  // tilt X axis
    const ry =  (x - 0.5) *  16;  // tilt Y axis

    card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(10px)`;
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    /* Smooth spring back */
    card.style.transition = 'transform 0.5s cubic-bezier(0.34,1.2,0.64,1)';
    setTimeout(() => { card.style.transition = 'transform 0.12s ease, box-shadow 0.2s ease'; }, 500);
  });

  card.addEventListener('mouseenter', () => {
    card.style.transition = 'transform 0.12s ease, box-shadow 0.2s ease';
  });
});

/* ============================================================
   SCROLL REVEAL  (Intersection Observer)
   ============================================================ */
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));

/* ============================================================
   BUTTON RIPPLE EFFECT
   ============================================================ */
const rippleCSS = document.createElement('style');
rippleCSS.textContent = `
  @keyframes rippleOut { to { transform: scale(1); opacity: 0; } }
  .ripple-span {
    position: absolute; border-radius: 50%; pointer-events: none;
    background: rgba(255,255,255,0.28);
    transform: scale(0);
    animation: rippleOut 0.55s ease-out forwards;
  }
`;
document.head.appendChild(rippleCSS);

function addRipple(btn, e) {
  btn.querySelectorAll('.ripple-span').forEach(r => r.remove());
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const r    = document.createElement('span');
  r.className = 'ripple-span';
  r.style.cssText = `
    width:${size}px; height:${size}px;
    left:${(e?.clientX ?? rect.left + rect.width/2)  - rect.left - size/2}px;
    top:${(e?.clientY  ?? rect.top  + rect.height/2) - rect.top  - size/2}px;
  `;
  btn.appendChild(r);
}

document.querySelectorAll('.btn-primary, .btn-glass').forEach(btn => {
  btn.style.overflow = 'hidden';
  btn.style.position = 'relative';
  btn.addEventListener('click', e => addRipple(btn, e));
});

/* ============================================================
   ANIMATED CHAT PREVIEW  (hero section typewriter)
   ============================================================ */
const CONVERSATIONS = [
  {
    user: 'How do I write a strong essay intro?',
    ai:   "Hook them immediately. Start with a bold claim or a surprising fact, then connect it to your thesis in one sharp sentence. Don't explain — intrigue.",
  },
  {
    user: "Explain Newton's second law simply",
    ai:   'Force = mass × acceleration. Push something harder and it accelerates more. Make it heavier and it accelerates less. That\'s literally it.',
  },
  {
    user: 'Help me understand photosynthesis',
    ai:   'Plants eat light. They take sunlight + water + CO₂ and turn it into sugar (their food) + oxygen (what we breathe). You\'re alive because plants had a weird idea.',
  },
  {
    user: 'What\'s the difference between mitosis and meiosis?',
    ai:   'Mitosis: one cell becomes two identical copies. Used for growth and repair. Meiosis: one cell becomes four unique cells. Used for reproduction. Same process, completely different purpose.',
  },
];

let convIdx = 0;
const previewMsgs   = document.getElementById('previewMsgs');
const previewTyping = document.getElementById('previewTyping');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function addPreviewMsg(role, text, typeIt = false) {
  const row    = document.createElement('div');
  const bubble = document.createElement('div');
  row.className    = `prev-msg prev-${role}`;
  bubble.className = 'prev-bubble';
  row.appendChild(bubble);
  previewMsgs.appendChild(row);

  if (typeIt) {
    for (const ch of text) {
      bubble.textContent += ch;
      previewMsgs.scrollTop = previewMsgs.scrollHeight;
      await delay(18 + Math.random() * 16);
    }
  } else {
    bubble.textContent = text;
  }
  previewMsgs.scrollTop = previewMsgs.scrollHeight;
}

function showPreviewTyping() {
  const row    = document.createElement('div');
  const bubble = document.createElement('div');
  row.className    = 'prev-msg prev-assistant prev-typing';
  bubble.className = 'prev-bubble';
  bubble.innerHTML = '<span class="d"></span><span class="d"></span><span class="d"></span>';
  row.appendChild(bubble);
  previewMsgs.appendChild(row);
  previewMsgs.scrollTop = previewMsgs.scrollHeight;
  return row;
}

async function typeIntoBar(text) {
  previewTyping.textContent = '';
  for (const ch of text) {
    previewTyping.textContent += ch;
    await delay(40 + Math.random() * 30);
  }
}

async function clearPreview() {
  previewMsgs.style.opacity = '0';
  previewMsgs.style.transition = 'opacity 0.3s ease';
  await delay(320);
  previewMsgs.innerHTML = '';
  previewMsgs.style.opacity = '1';
}

async function runPreview() {
  await delay(1200); // Initial delay

  while (true) {
    const conv = CONVERSATIONS[convIdx % CONVERSATIONS.length];
    convIdx++;

    /* Type into the input bar */
    await typeIntoBar(conv.user);
    await delay(500);

    /* "Send" — clear bar, add user bubble */
    previewTyping.textContent = '';
    await addPreviewMsg('user', conv.user, false);
    await delay(400);

    /* Typing indicator */
    const typingEl = showPreviewTyping();
    await delay(1200 + conv.ai.length * 6);
    typingEl.remove();

    /* AI response types out */
    await addPreviewMsg('assistant', conv.ai, true);

    /* Pause before next conversation */
    await delay(3500);

    /* Clear and loop */
    await clearPreview();
    await delay(600);
  }
}

if (previewMsgs) runPreview();

/* ============================================================
   HERO PREVIEW CARD — mouse parallax (subtle)
   ============================================================ */
const previewWrap = document.getElementById('previewWrap');
if (previewWrap) {
  document.addEventListener('mousemove', e => {
    const xPct = (e.clientX / window.innerWidth  - 0.5) * 2; // -1 → 1
    const yPct = (e.clientY / window.innerHeight - 0.5) * 2;

    /* Only apply if not in a hover state (which has its own transition) */
    if (!previewWrap.matches(':hover')) {
      const card = previewWrap.querySelector('.chat-preview');
      if (card) {
        card.style.transform = `
          rotateY(${-8 + xPct * 3}deg)
          rotateX(${4  + yPct * -2}deg)
          translateY(${yPct * -6}px)
        `;
      }
    }
  });
}
