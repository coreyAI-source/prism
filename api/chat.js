/* ============================================================
   PRISM — api/chat.js
   Serverless proxy to OpenRouter.
   API key: OPENROUTER_API_KEY env var (Vercel dashboard / .env)
   ============================================================ */

/* ── Free models — confirmed available on OpenRouter, best-first ── */
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
];

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

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

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function shouldSkipModel(errMsg = '') {
  const lower = errMsg.toLowerCase();
  return SKIP_MODEL_PHRASES.some(phrase => lower.includes(phrase));
}

module.exports = async function handler(req, res) {
  /* Set CORS headers on every response */
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  /* Preflight */
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service not configured.' });
  }

  let messages;
  try {
    ({ messages } = req.body);
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  const clean = messages
    .filter(m =>
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
    )
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-20);

  if (clean.length === 0) {
    return res.status(400).json({ error: 'No valid messages.' });
  }

  const siteUrl = process.env.SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://prism-five-lilac.vercel.app');

  const payload = {
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...clean],
    max_tokens: 1500,
    temperature: 0.7,
  };

  for (const model of FREE_MODELS) {
    let upstream;
    try {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      continue;
    }

    if (RETRY_STATUSES.has(upstream.status)) continue;

    if (upstream.status === 400) {
      const errBody = await upstream.json().catch(() => ({}));
      const errMsg  = errBody?.error?.message || '';
      if (shouldSkipModel(errMsg)) continue;
      return res.status(400).json({ error: errMsg || 'Bad request.' });
    }

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({
        error: err?.error?.message || `Upstream error ${upstream.status}.`,
      });
    }

    const data    = await upstream.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;

    if (!content) continue;

    return res.status(200).json({ content, model });
  }

  return res.status(503).json({
    error: 'All engines are busy right now — try again in a moment.',
  });
}
