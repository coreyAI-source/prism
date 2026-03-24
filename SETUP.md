# Prism — Deploy in 5 Steps

## File structure
```
index.html          → Landing page (shown at your domain root)
chat.html           → Chat interface
styles.css          → All styles (shared between both pages)
landing.js          → Landing page animations + chat preview
app.js              → Chat page logic + memory
netlify/functions/  → API proxy (hides your API key)
```

## What you need
- A free [GitHub](https://github.com) account
- A free [Netlify](https://netlify.com) account
- Your OpenRouter API key

---

## Step 1 — Push to GitHub

1. Create a new repository on github.com (call it `prism` or anything)
2. Upload all files in this folder to it (drag & drop in the GitHub UI, or use git)

---

## Step 2 — Connect to Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project**
2. Connect your GitHub account and select your repo
3. Build settings are auto-detected via `netlify.toml` — leave them as-is
4. Click **Deploy site**

---

## Step 3 — Add your API key

1. In your Netlify dashboard → **Site configuration** → **Environment variables**
2. Click **Add a variable**:
   - Key: `OPENROUTER_API_KEY`
   - Value: your OpenRouter key
3. Go to **Deploys** → **Trigger deploy** → **Deploy site**

That's it — Prism is live.

---

## Step 4 — Set up Google AdSense (when you have an account)

Once Google approves your AdSense account:

1. Open `index.html`
2. Replace every instance of `ca-pub-XXXXXXXXXXXXXXXXX` with your publisher ID
3. Replace each `YOUR_*_AD_SLOT` placeholder with your actual ad slot IDs
4. Push to GitHub — Netlify auto-deploys

---

## Step 5 — Custom domain (optional)

In Netlify: **Domain management** → **Add custom domain**
Free subdomains follow the pattern `yoursite.netlify.app`.

---

## Free models included (auto-rotates if one hits its rate limit)

| Model | Size |
|---|---|
| Llama 3.1 8B | 8B |
| Llama 3.2 3B | 3B |
| Gemma 2 9B | 9B |
| Mistral 7B | 7B |
| Phi-3 Mini 128k | ~3.8B |
| Qwen 2 7B | 7B |
| Hermes 3 (405B) | 405B |

If one model is rate-limited, the function automatically tries the next one.

---

## How memory works

Conversations are stored in each user's browser (`localStorage`).
- Persists across page refreshes
- Up to 30 messages kept in context
- Clicking the trash icon clears it
- Each user has their own independent memory — nothing is shared server-side
