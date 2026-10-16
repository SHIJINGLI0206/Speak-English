# SpeakUp iMac Waker MCP

This is a separate Cloudflare Worker for one action: ask the Raspberry Pi to send a Wake-on-LAN packet to the iMac. It does **not** accept shell commands, expose the Pi to the internet, or claim that the SpeakUp model server is running. The existing SpeakUp app and `speakup-coach-api` Worker are unchanged.

## Flow

1. ChatGPT connects to `/mcp` using OAuth 2.1. The authorization page signs the owner in with GitHub and checks immutable GitHub user ID `13295012`.
2. The `wake_imac` tool stores a short-lived, deduplicated job in this Worker's dedicated D1 database. The `wake_status` tool reports `queued`, `claimed`, `packet_sent`, or `failed`.
3. A hardened systemd service on the Pi polls `/pi/jobs/claim` over outbound HTTPS using its own 256-bit bearer token. It can run only the fixed `/usr/bin/wakeonlan` command and reports the result.
4. `packet_sent` means the Pi successfully sent the magic packet. It is **not** proof of iMac wake or model-server readiness. Starting the local AI server requires a separate macOS LaunchAgent/service and a health check.

The queue stores job metadata and owner ID only. No raw audio, video, or arbitrary command text is stored here.

## Cloudflare deployment

From `waker-mcp/`:

```sh
npm install
WRANGLER_LOG_PATH=/private/tmp/speakup-wrangler.log npm run check
WRANGLER_LOG_PATH=/private/tmp/speakup-wrangler.log npm run deploy
WRANGLER_LOG_PATH=/private/tmp/speakup-wrangler.log npx wrangler d1 migrations apply WAKE_DB --remote
```

The config pins the existing dedicated KV namespace and D1 database IDs, so redeployment keeps using the same OAuth and wake-job storage. The public Worker origin and GitHub numeric owner ID are in `wrangler.jsonc`; they are not secrets. Never put the GitHub client secret or Pi polling token in that file, source control, chat, or a frontend bundle. Store them with `wrangler secret put GITHUB_CLIENT_SECRET` and `wrangler secret put PI_POLL_TOKEN`. The latter must be identical to `SPEAKUP_PI_TOKEN` in the Pi's root-only `/etc/speakup-waker.env`.

GitHub OAuth app settings:

- Application: `SpeakUp Waker (private)`
- Homepage: `https://shijingli0206.github.io/Speak-English/`
- Exact callback: `https://speakup-waker-mcp.jinglishi0206.workers.dev/callback`
- Wildcard redirects and Device Flow: off
- User profile scope requested at sign-in: `read:user`; no repository scope

If the Worker origin changes, update the Wrangler `PUBLIC_ORIGIN` and GitHub callback *together*, then redeploy. A mismatch breaks OAuth on purpose.

## Raspberry Pi

`pi/provision.py` generates a unique token without printing it and writes `/etc/speakup-waker.env` with root-only `0600` permissions. It refuses to overwrite an existing file. The installed systemd service reads that file and runs as a dynamic, unprivileged user. No inbound port or Cloudflare Tunnel is needed.

The current fixed target is the iMac's Wi-Fi MAC `56:6a:ce:33:72:a2` and Wi-Fi broadcast `192.168.71.255`. These were tested on the home network. If the Mac's private Wi-Fi address rotates or the subnet changes, update the Pi configuration and repeat a real wake-from-sleep test.

Useful checks on the Pi:

```sh
systemctl is-active speakup-waker.service
sudo journalctl -u speakup-waker.service -n 20 --no-pager
sudo stat -c '%a %U %G' /etc/speakup-waker.env
```

Do not print the environment file or service environment in logs or support requests.

## ChatGPT connection

In ChatGPT web, open **Plugins → Add custom MCP server** and use:

`https://speakup-waker-mcp.jinglishi0206.workers.dev/mcp`

Choose OAuth. On the consent page, check the client name and redirect host, select **Continue with GitHub**, then follow the **Continue to GitHub** link on the next page. Only the approved GitHub account can obtain a token that can queue wake jobs. `wake_imac` is a write tool, so review ChatGPT's confirmation before execution. Test text first, then voice on the iPhone in the same ChatGPT account. iPhone app availability and voice tool invocation must be verified on the device; this repository cannot prove them.

## Security / operating limits

- OAuth token validation checks resource audience and scope before the MCP tool executes.
- The Pi token is separate from OAuth and is compared in constant time. The Pi poller never receives ChatGPT credentials.
- Jobs expire from the queue after 90 seconds. A second request within 60 seconds reuses the recent job.
- No shell-command parameters are accepted; only a fixed magic packet can be sent.
- Polling every 10 seconds is about 8,640 Worker requests per day, before interactive MCP traffic. Check current Cloudflare free-plan limits for your account before changing the interval.
- Revoke a lost Pi token by rotating `/etc/speakup-waker.env` and the `PI_POLL_TOKEN` Worker secret. Revoke ChatGPT access from the GitHub OAuth app or OAuth provider grant if needed.
