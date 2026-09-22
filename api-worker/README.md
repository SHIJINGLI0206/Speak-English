# SpeakUp Cloudflare Precision Coach API

This lightweight Worker receives one completed pronunciation attempt only after opt-in, transcribes it through OpenAI, then uses a small vision-capable OpenAI model for concise structured feedback. It does not run a GPU instance. Camera landmarks remain in the browser; one low-resolution still is sent only after separate opt-in.

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

6. Copy the Worker URL Wrangler prints, for example `https://speakup-coach-api.<account>.workers.dev`, into `js/runtime-config.js`. The current app also permits an override in Settings. This URL is safe to store in the browser; it is not a secret.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, enter a development OpenAI key, then run:

```bash
npm run dev
```

Do not commit `.dev.vars`, API keys, or any other secrets.

## Privacy and limits

- The browser sends a completed audio attempt only after the learner turns on Precision Coach. It sends one compressed camera still only after a separate visual-evidence opt-in.
- It does not upload continuous video or persist raw audio/video in the Worker.
- `RATE_LIMIT` defaults to 12 analyses per IP per minute. `MAX_OPENAI_ANALYSES_PER_DAY` defaults to 12 per IP, to cap spend. Use Cloudflare Access or Turnstile before sharing the app publicly.
