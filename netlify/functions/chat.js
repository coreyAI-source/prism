/* ============================================================
   PRISM — netlify/functions/chat.js
   Serverless proxy to OpenRouter.
   API key: OPENROUTER_API_KEY env var (Netlify dashboard / .env)
   ============================================================ */

/* ── Free models — confirmed available on OpenRouter, best-first ── */
const FREE_MODELS = [
  'openrouter/free',                          /* auto-routes to any available free model */
  'nvidia/nemotron-3-super-120b-a12b:free',   /* 120B — largest free */
  'minimax/minimax-m2.5:free',
  'arcee-ai/trinity-large-preview:free',
  'stepfun/step-3.5-flash:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'liquid/lfm-2.5-1.2b-thinking:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

/* ── Statuses that mean "this model is busy — try the next" ── */
const RETRY_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

/* ── Error message fragments that mean "token/context limit hit" ─
   OpenRouter returns 400 for these — we rotate instead of surfacing */
const SKIP_MODEL_PHRASES = [
  'context_length_exceeded',
  'context length',
  'maximum context',
  'token limit',
  'tokens exceeded',
  'prompt is too long',
  'reduce the length',
  'no endpoints found',
  'user not found',
  'model not found',
  'not available',
];

const SYSTEM_PROMPT = `You are Prism, a sharp and genuinely helpful assistant. \
You help students and curious people think through problems, understand difficult topics, \
write better, and work through challenges in any subject — math, science, history, coding, \
essays, and more.

Be direct, clear, and actually useful. Format your responses well: use headers, bullet points, \
numbered steps, and code blocks where they genuinely help. Keep answers focused and on-point. \
Don't pad responses.`;

/* ── CORS headers ─────────────────────────────────────────────── */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
};

/* ── Helpers ──────────────────────────────────────────────────── */
function shouldSkipModel(errMsg = '') {
  const lower = errMsg.toLowerCase();
  return SKIP_MODEL_PHRASES.some(phrase => lower.includes(phrase));
}

/* ── Handler ──────────────────────────────────────────────────── */
exports.handler = async (event) => {
  /* Preflight */
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  /* API key — set OPENROUTER_API_KEY in Netlify dashboard (or .env for local dev) */
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Service not configured.' }) };
  }

  /* Parse + validate body */
  let messages;
  try {
    ({ messages } = JSON.parse(event.body));
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid request.' }) };
  }

  /* Sanitize — only role/content, last 20 turns, max 8 k chars each */
  const clean = messages
    .filter(m =>
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
    )
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-20);

  if (clean.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No valid messages.' }) };
  }

  const siteUrl = process.env.URL || 'https://prism.netlify.app';

  const payload = {
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...clean],
    max_tokens: 1500,
    temperature: 0.7,
  };

  /* ── Try each model in sequence ──────────────────────────────── */
  for (const model of FREE_MODELS) {
    let res;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  siteUrl,
          'X-Title':       'Prism',
        },
        body: JSON.stringify({ ...payload, model }),
      });
    } catch {
      /* Network error — try next model */
      continue;
    }

    /* Rate limited or server error — rotate to next model */
    if (RETRY_STATUSES.has(res.status)) continue;

    /* 400 — check if it's a token/context limit; if so, rotate */
    if (res.status === 400) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg  = errBody?.error?.message || '';
      if (shouldSkipModel(errMsg)) continue; /* model unavailable or context too long — try next */
      /* Any other 400 is a bad request we can't recover from */
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: errMsg || 'Bad request.' }),
      };
    }

    /* API key invalid — no point trying other models */
    if (res.status === 401) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Service configuration error.' }) };
    }

    /* Any other non-OK status — try the next model */
    if (!res.ok) continue;

    /* Success — extract content */
    const data    = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;

    if (!content) continue; /* Empty response — try next model */

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ content, model }),
    };
  }

  /* All models exhausted */
  return {
    statusCode: 503,
    headers: CORS,
    body: JSON.stringify({ error: 'All engines are busy right now — try again in a moment.' }),
  };
};
