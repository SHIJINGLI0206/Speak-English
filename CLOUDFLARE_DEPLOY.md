# Deploy SpeakUp with Cloudflare

The frontend can remain on GitHub Pages, or you can host it on Cloudflare Pages. The AI backend is a separate Cloudflare Worker in `api-worker/`.

## 1. Deploy the secure AI Worker

Follow [api-worker/README.md](api-worker/README.md). In short:

```bash
cd api-worker
npm install
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT
# paste that namespace ID into wrangler.jsonc
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Never put `OPENAI_API_KEY` in `js/runtime-config.js`, `wrangler.jsonc`, GitHub Secrets intended for the frontend, or the SpeakUp settings page.

## 2. Connect the frontend

The Worker deployment prints a URL ending in `.workers.dev`. Put it in `js/runtime-config.js` for production; the current deployment is already configured. SpeakUp sends a completed audio attempt only after the learner enables **Secure Coach**. A camera frame is sent only after a separate visual-evidence opt-in.

If the frontend stays on GitHub Pages, leave `ALLOWED_ORIGINS` as `https://shijingli0206.github.io`. If you use Cloudflare Pages, update it to your Pages URL or custom domain and redeploy the Worker.

## 3. Optional: host the frontend on Cloudflare Pages

In the Cloudflare dashboard:

1. Go to **Workers & Pages → Create application → Pages → Connect to Git**.
2. Select this GitHub repository.
3. Use the repository root as the root directory, leave the build command empty, and set the output directory to `.`.
4. Deploy, then add the Pages URL to the Worker `ALLOWED_ORIGINS` value and redeploy the Worker.

For a personal app, the Worker’s KV limit is a useful baseline. Before sharing the app publicly, add Cloudflare Access or Turnstile to protect the paid OpenAI endpoint from direct abuse.

## Optional D1 learning-history backup

`speakup-progress` is bound as `PROGRESS_DB`. Apply the migration before deploying the Worker:

```bash
cd api-worker
npx wrangler d1 migrations apply speakup-progress --remote
```

The app remains local-first. Backup is opt-in in Settings and stores only the learner profile, scores, feedback text, transcripts, and review schedule; it never stores raw audio or camera frames. Each browser receives a random device-only sync key. There is no sign-in or account recovery in this personal-app design: clearing browser storage removes that key and therefore access to an existing backup. Do not enable this feature for multiple people or a shared production app without real authentication and an explicit retention/deletion policy.
