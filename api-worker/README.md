# SpeakUp Cloudflare AI Coach API

This Worker receives one completed pronunciation attempt, transcribes the audio with `gpt-4o-mini-transcribe`, then asks GPT-5.6 Luna for short structured feedback. The browser never receives an OpenAI API key.

## Deploy

1. Install Node.js 18.17+ and authenticate Wrangler:

   ```bash
   cd api-worker
   npm install
   npx wrangler login
   ```

2. Create a KV namespace for the per-IP analysis limit:

   ```bash
   npx wrangler kv namespace create RATE_LIMIT
   ```

   Copy the returned namespace ID into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

3. Set your published app URL in `ALLOWED_ORIGINS` in `wrangler.jsonc`. For the current GitHub Pages app, it is `https://shijingli0206.github.io`. If you host the frontend on Cloudflare Pages, replace it with that Pages URL or custom domain.

4. Store the OpenAI key as a Worker secret. It is entered once in the terminal and is not written to source code:

   ```bash
   npx wrangler secret put OPENAI_API_KEY
   ```

5. Deploy:

   ```bash
   npm run deploy
   ```

6. Copy the Worker URL Wrangler prints, for example `https://speakup-coach-api.<account>.workers.dev`. In SpeakUp, open **Settings → Secure Coach API URL**, paste it, and save. This URL is safe to store in the browser; it is not a secret.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, enter a development OpenAI key, and run:

```bash
npm run dev
```

Do not commit `.dev.vars`, API keys, or any other secrets.

## Privacy and limits

- The browser sends a completed audio attempt and, only when on-device face landmarks are high confidence, one compressed camera frame.
- It does not upload continuous video or persist raw audio/video in the Worker.
- `RATE_LIMIT` defaults to 12 analyses per IP per minute. It is a basic personal-app safeguard; use Cloudflare Access or Turnstile before sharing the app publicly.
