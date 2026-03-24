/* ============================================================
   PRISM — netlify/functions/chat.js
   Serverless proxy to OpenRouter.
   API key: OPENROUTER_API_KEY env var (Netlify dashboard / .env)
   ============================================================ */

/* ── Free models — ordered best-first, rotate on any failure ── */
const FREE_MODELS = [
  /* ── Tier 1: Large / Flagship ─────────────────────────────── */
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-4-scout:free',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/llama-3.1-nemotron-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'tngtech/deepseek-r1t-chimera:free',
  'featherless/qwerky-72b:free',

  /* ── Tier 2: Mid-size ──────────────────────────────────────── */
  'deepseek/deepseek-r1-distill-llama-70b:free',
  'deepseek/deepseek-r1-distill-qwen-32b:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'microsoft/phi-3-medium-128k-instruct:free',
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
  'qwen/qwen-2-7b-instruct:free',
  'openchat/openchat-7b:free',
  'huggingfaceh4/zephyr-7b-beta:free',

  /* ── Tier 3: Small / Fast fallbacks ───────────────────────── */
  'deepseek/deepseek-r1-distill-qwen-14b:free',
  'google/gemma-3-4b-it:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-3-1b-it:free',
  'meta-llama/llama-3.2-1b-instruct:free',
];

/* ── Statuses that mean "this model is busy — try the next" ── */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/* ── Error message fragments that mean "token/context limit hit" ─
   OpenRouter returns 400 for these — we rotate instead of surfacing */
const TOKEN_LIMIT_PHRASES = [
  'context_length_exceeded',
  'context length',
  'maximum context',
  'token limit',
  'tokens exceeded',
  'prompt is too long',
  'reduce the length',
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
function isTokenLimitError(errMsg = '') {
  const lower = errMsg.toLowerCase();
  return TOKEN_LIMIT_PHRASES.some(phrase => lower.includes(phrase));
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
      if (isTokenLimitError(errMsg)) continue; /* context too long — try next */
      /* Any other 400 is a bad request we can't recover from */
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: errMsg || 'Bad request.' }),
      };
    }

    /* Other non-retryable error (e.g. 401 auth) — surface it */
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ error: err?.error?.message || `Upstream error ${res.status}.` }),
      };
    }

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
