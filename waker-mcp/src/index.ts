import {
  AuthorizationError,
  CimdFetchError,
  OAuthAuthorizationServer,
  OAuthResourceServer,
  authorizationErrorRedirect,
  type AuthRequest,
  type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { claimWake, enqueueWake, finishWake, getWakeJob } from "./jobs";

type WakerEnv = Env & {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  PI_POLL_TOKEN: string;
};

type OwnerProps = { userId: string; login: string };
const SCOPE = "wake:imac";

function safeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function html(body: string, headers?: Headers): Response {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  responseHeaders.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  return noStore(new Response(body, { headers: responseHeaders }));
}

function consentPage(details: ConsentDescription, handle: string): string {
  const publisher = details.clientDomain
    ? `Published by ${safeText(details.clientDomain)}.`
    : "This app registered itself; its name is not verified.";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize SpeakUp Waker</title>
  <style>body{font:16px system-ui;max-width:38rem;margin:8vh auto;padding:1.2rem;line-height:1.5}button{padding:.7rem 1.1rem;margin-right:.6rem}aside{padding:1rem;background:#fff4d5}</style>
  <h1>Allow ${safeText(details.clientName)} to wake your iMac?</h1><p>${publisher}</p>
  <p>Access will be sent to <strong>${safeText(details.redirectHost)}</strong>.</p>
  ${details.redirectIsLoopback ? "<aside>This redirects to an app on your computer. Continue only if you started this sign-in.</aside>" : ""}
  <p>Permission: wake the SpeakUp iMac. The tool cannot run arbitrary commands.</p>
  <p>Requested scopes: ${details.scope.map(safeText).join(", ") || "none"}. If offline access is requested, the connection can remain linked until you revoke it.</p>
  <form method="post" action="/authorize"><input type="hidden" name="handle" value="${safeText(handle)}">
  <button name="decision" value="approve">Continue with GitHub</button><button name="decision" value="deny">Deny</button></form></html>`;
}

function oauthError(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) {
    return noStore(Response.redirect(error.redirectTo, 302));
  }
  if (error instanceof AuthorizationError) {
    return noStore(new Response(error.description, { status: 400 }));
  }
  if (error instanceof CimdFetchError) {
    return noStore(new Response("OAuth client metadata could not be verified.", { status: 400 }));
  }
  console.error("OAuth request failed", error instanceof Error ? error.name : "unknown");
  return noStore(new Response("Authentication temporarily unavailable.", { status: 503 }));
}

async function githubIdentity(code: string, env: WakerEnv): Promise<{ id: number; login: string }> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.PUBLIC_ORIGIN}/callback`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenResponse.ok) throw new Error("GitHub token exchange failed");
  const tokenData: unknown = await tokenResponse.json();
  if (typeof tokenData !== "object" || tokenData === null || !("access_token" in tokenData) || typeof tokenData.access_token !== "string") {
    throw new Error("GitHub did not return an access token");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      "Authorization": `Bearer ${tokenData.access_token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "speakup-waker-mcp",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!userResponse.ok) throw new Error("GitHub identity lookup failed");
  const userData: unknown = await userResponse.json();
  if (typeof userData !== "object" || userData === null || !("id" in userData) || !("login" in userData)
    || typeof userData.id !== "number" || typeof userData.login !== "string") {
    throw new Error("GitHub identity response was invalid");
  }
  return { id: userData.id, login: userData.login };
}

async function authorize(request: Request, env: WakerEnv, server: OAuthAuthorizationServer<WakerEnv>): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return noStore(new Response("GitHub sign-in is not configured.", { status: 503 }));
  }
  const oauth = server.getOAuthApi(env);
  try {
    if (request.method === "GET") {
      const authRequest: AuthRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      return html(consentPage(details, consent.handle), consent.headers);
    }
    if (request.method === "POST") {
      const form = await request.formData();
      const handle = form.get("handle");
      if (typeof handle !== "string" || handle.length > 256) {
        return noStore(new Response("Invalid authorization form.", { status: 400 }));
      }
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return noStore(new Response(null, { status: 302, headers: denied.headers }));
      }
      const approved = await oauth.approveConsent(request, handle);
      const upstream = await oauth.beginUpstream(approved.request, { headers: approved.headers });
      const githubUrl = new URL("https://github.com/login/oauth/authorize");
      githubUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      githubUrl.searchParams.set("redirect_uri", `${env.PUBLIC_ORIGIN}/callback`);
      githubUrl.searchParams.set("scope", "read:user");
      githubUrl.searchParams.set("state", upstream.state);
      upstream.headers.set("Location", githubUrl.toString());
      return noStore(new Response(null, { status: 302, headers: upstream.headers }));
    }
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  } catch (error) {
    return oauthError(error);
  }
}

async function callback(request: Request, env: WakerEnv, server: OAuthAuthorizationServer<WakerEnv>): Promise<Response> {
  const oauth = server.getOAuthApi(env);
  try {
    const resumed = await oauth.finishUpstream(request);
    const params = new URL(request.url).searchParams;
    if (params.has("error") || !params.get("code")) {
      resumed.headers.set("Location", authorizationErrorRedirect(resumed.request, "access_denied"));
      return noStore(new Response(null, { status: 302, headers: resumed.headers }));
    }
    const user = await githubIdentity(params.get("code")!, env);
    if (String(user.id) !== env.GITHUB_OWNER_ID) {
      return noStore(new Response("This GitHub account is not authorized for SpeakUp Waker.", { status: 403, headers: resumed.headers }));
    }
    const { redirectTo } = await oauth.completeAuthorization({
      request: resumed.request,
      userId: String(user.id),
      metadata: { label: user.login },
      scope: resumed.request.scope.filter((scope) => scope === SCOPE || scope === "offline_access"),
      props: { userId: String(user.id), login: user.login } satisfies OwnerProps,
    });
    resumed.headers.set("Location", redirectTo);
    return noStore(new Response(null, { status: 302, headers: resumed.headers }));
  } catch (error) {
    return oauthError(error);
  }
}

function validPiToken(request: Request, env: WakerEnv): boolean {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ") || header.length > 200 || !env.PI_POLL_TOKEN) return false;
  const expected = new TextEncoder().encode(env.PI_POLL_TOKEN);
  const provided = new TextEncoder().encode(header.slice(7));
  return expected.byteLength === provided.byteLength && crypto.subtle.timingSafeEqual(expected, provided);
}

async function boundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new RangeError("Payload too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function piRequest(request: Request, env: WakerEnv): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!validPiToken(request, env)) return noStore(new Response("Unauthorized", { status: 401 }));
  const path = new URL(request.url).pathname;
  if (path === "/pi/jobs/claim") {
    const job = await claimWake(env.WAKE_DB);
    return noStore(job ? Response.json({ id: job.id }) : new Response(null, { status: 204 }));
  }
  const match = /^\/pi\/jobs\/([a-f0-9-]{36})\/result$/.exec(path);
  if (match) {
    let payload: unknown;
    try { payload = await boundedJson(request, 1024); }
    catch (error) { return new Response(error instanceof RangeError ? "Payload too large" : "Invalid JSON", { status: error instanceof RangeError ? 413 : 400 }); }
    if (typeof payload !== "object" || payload === null || !("status" in payload)
      || (payload.status !== "packet_sent" && payload.status !== "failed")) {
      return new Response("Invalid status", { status: 400 });
    }
    const updated = await finishWake(env.WAKE_DB, match[1], payload.status);
    return noStore(new Response(null, { status: updated ? 204 : 409 }));
  }
  return new Response("Not found", { status: 404 });
}

function makeMcpHandler(env: WakerEnv, ownerId: string) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: "SpeakUp iMac Waker", version: "0.1.0" });
    server.registerTool("wake_imac", {
      title: "Wake SpeakUp iMac",
      description: "Queue one Wake-on-LAN packet for my iMac. Does not run commands or start a model server. Returns a job ID for status checks.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async () => {
      const job = await enqueueWake(env.WAKE_DB, ownerId);
      const data = { jobId: job.id, status: job.status, note: "Wake requested; packet delivery is not yet confirmed." };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    });
    server.registerTool("wake_status", {
      title: "Check iMac wake status",
      description: "Check whether the Raspberry Pi sent the Wake-on-LAN packet for a wake job. Packet sent does not prove the iMac or SpeakUp model server is ready.",
      inputSchema: z.object({ jobId: z.string().uuid() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async ({ jobId }) => {
      const job = await getWakeJob(env.WAKE_DB, ownerId, jobId);
      const data = job
        ? { jobId, status: job.status, packetSent: job.status === "packet_sent", serverReady: false }
        : { jobId, status: "not_found", packetSent: false, serverReady: false };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    });
    return server;
  }, { route: "/mcp", corsOptions: false, responseMode: "json" });
}

export default {
  async fetch(request: Request, env: WakerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== env.PUBLIC_ORIGIN && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return new Response("Unknown host", { status: 421 });
    }
    if (url.pathname === "/health") return Response.json({ ok: true, service: "speakup-waker-mcp" });
    if (url.pathname.startsWith("/pi/")) return piRequest(request, env);

    const issuer = env.PUBLIC_ORIGIN;
    const resource = `${issuer}/mcp`;
    const server = new OAuthAuthorizationServer<WakerEnv>({
      issuer,
      resources: [resource],
      defaultResource: resource,
      scopesSupported: [SCOPE, "offline_access"],
      clientIdMetadataDocumentEnabled: true,
      clientRegistrationEndpoint: "/oauth/register",
    });
    if (url.pathname === "/authorize") return authorize(request, env, server);
    if (url.pathname === "/callback") return callback(request, env, server);

    const protectedServer = new OAuthResourceServer<WakerEnv, OwnerProps>({
      resourceMetadata: { resource, authorization_servers: [issuer] },
      requiredScopes: [SCOPE],
      validateToken: (bindings) => (audience, token) => server.validateToken(audience, token, bindings),
      handler: {
        fetch(mcpRequest, bindings, authCtx) {
          if (!authCtx.auth.scope.includes(SCOPE) || authCtx.props.userId !== bindings.GITHUB_OWNER_ID) {
            return new Response("Forbidden", { status: 403 });
          }
          return makeMcpHandler(bindings, authCtx.props.userId)(mcpRequest, bindings, authCtx);
        },
      },
    });
    if (url.pathname === "/mcp" || url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return protectedServer.fetch(request, env, ctx);
    }
    return server.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<WakerEnv>;
