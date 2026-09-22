const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_FRAME_CHARS = 450_000;
const MAX_PROGRESS_BYTES = 900_000;
const MAX_HISTORY_ITEMS = 800;
const textEncoder = new TextEncoder();

const feedbackSchema = {
  type: 'object', additionalProperties: false,
  required: ['score', 'transcription', 'wellDone', 'toImprove', 'opening', 'rounding', 'tip', 'confidence'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 }, transcription: { type: 'string' },
    wellDone: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 },
    toImprove: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 },
    opening: { type: 'string', enum: ['Open', 'Moderate', 'Narrow', 'Not assessed'] },
    rounding: { type: 'string', enum: ['Rounded', 'Relaxed', 'Not assessed'] },
    tip: { type: 'string', maxLength: 180 }, confidence: { type: 'string', enum: ['high', 'limited'] }
  }
};

function allowedOrigin(request, env) {
  const configured = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  return origin && configured.includes(origin) ? origin : configured[0] || '';
}

function headers(request, env) {
  const origin = allowedOrigin(request, env);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-SpeakUp-Device, X-SpeakUp-Sync-Key',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function shortText(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberInRange(value, min, max, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function syncCredentials(request) {
  const deviceId = request.headers.get('X-SpeakUp-Device') || '';
  const syncKey = request.headers.get('X-SpeakUp-Sync-Key') || '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const key = /^[A-Za-z0-9_-]{40,160}$/;
  return uuid.test(deviceId) && key.test(syncKey) ? { deviceId, syncKey } : null;
}

function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory.slice(-MAX_HISTORY_ITEMS).map(item => ({
    skillId: shortText(item?.skillId, 64), target: shortText(item?.target, 280), ipa: shortText(item?.ipa, 120),
    category: shortText(item?.category, 80), sentence: shortText(item?.sentence, 400), stage: shortText(item?.stage, 80),
    format: shortText(item?.format, 32), score: Math.round(numberInRange(item?.score, 0, 100)),
    transcription: shortText(item?.transcription, 500), wellDone: shortText(item?.wellDone, 280),
    toImprove: shortText(item?.toImprove, 280), timestamp: numberInRange(item?.timestamp, 0, 4102444800000),
    date: shortText(item?.date, 10), nextReviewAt: numberInRange(item?.nextReviewAt, 0, 4102444800000),
    evidence: {
      analysisSource: shortText(item?.evidence?.analysisSource, 100),
      transcriptConfidence: shortText(item?.evidence?.transcriptConfidence, 24),
      visualConfidence: shortText(item?.evidence?.visualConfidence, 24)
    }
  })).filter(item => item.target && item.timestamp);
}

function sanitizeProgress(body, deviceId) {
  const rawProfile = body?.profile || {};
  const payload = {
    version: 1,
    profile: {
      onboardingComplete: Boolean(rawProfile.onboardingComplete),
      dailyMinutes: Math.round(numberInRange(rawProfile.dailyMinutes, 10, 120, 30)),
      careerGoal: shortText(rawProfile.careerGoal, 160),
      region: shortText(rawProfile.region, 80),
      firstLanguage: shortText(rawProfile.firstLanguage, 32),
      deviceId
    },
    history: sanitizeHistory(body?.history),
    syncedAt: Date.now()
  };
  const serialized = JSON.stringify(payload);
  if (textEncoder.encode(serialized).byteLength > MAX_PROGRESS_BYTES) throw new Error('Progress backup is too large.');
  return serialized;
}

async function readProgress(request, env) {
  if (!env.PROGRESS_DB) return json(request, env, { error: 'Progress backup is not configured.' }, 503);
  const credentials = syncCredentials(request);
  if (!credentials) return json(request, env, { error: 'Invalid progress-backup credentials.' }, 401);
  const record = await env.PROGRESS_DB.prepare('SELECT secret_hash, payload, updated_at FROM progress_backups WHERE device_id = ?').bind(credentials.deviceId).first();
  if (!record) return json(request, env, { exists: false });
  if ((await digest(credentials.syncKey)) !== record.secret_hash) return json(request, env, { error: 'Invalid progress-backup credentials.' }, 401);
  return json(request, env, { exists: true, payload: JSON.parse(record.payload), updatedAt: record.updated_at });
}

async function writeProgress(request, env) {
  if (!env.PROGRESS_DB) return json(request, env, { error: 'Progress backup is not configured.' }, 503);
  const credentials = syncCredentials(request);
  if (!credentials) return json(request, env, { error: 'Invalid progress-backup credentials.' }, 401);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_PROGRESS_BYTES) return json(request, env, { error: 'Progress backup is too large.' }, 413);
  const existing = await env.PROGRESS_DB.prepare('SELECT secret_hash FROM progress_backups WHERE device_id = ?').bind(credentials.deviceId).first();
  const secretHash = await digest(credentials.syncKey);
  if (existing && existing.secret_hash !== secretHash) return json(request, env, { error: 'Invalid progress-backup credentials.' }, 401);
  const payload = sanitizeProgress(await request.json(), credentials.deviceId);
  const updatedAt = Date.now();
  await env.PROGRESS_DB.prepare('INSERT INTO progress_backups (device_id, secret_hash, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at')
    .bind(credentials.deviceId, secretHash, payload, updatedAt).run();
  return json(request, env, { ok: true, updatedAt });
}

function json(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: headers(request, env) });
}

async function enforceRateLimit(request, env, scope = 'analysis') {
  if (!env.RATE_LIMIT) return { allowed: true };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const window = Math.floor(Date.now() / 60_000);
  const key = `${scope}:${ip}:${window}`;
  const current = Number(await env.RATE_LIMIT.get(key) || 0);
  const limit = Number(env.MAX_ANALYSES_PER_MINUTE || 12);
  if (current >= limit) return { allowed: false };
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 120 });
  return { allowed: true };
}

async function enforceDailyOpenAiBudget(request, env) {
  if (!env.RATE_LIMIT) return { allowed: true };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const key = `openai:${ip}:${day}`;
  const current = Number(await env.RATE_LIMIT.get(key) || 0);
  const limit = Number(env.MAX_OPENAI_ANALYSES_PER_DAY || 12);
  if (current >= limit) return { allowed: false };
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 172800 });
  return { allowed: true };
}

function tokenCoverage(target, transcript) {
  const tokens = value => String(value || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const expected = tokens(target), heard = new Set(tokens(transcript));
  if (!expected.length) return { expectedWords: 0, matchedWords: 0, coverage: 0 };
  const matchedWords = expected.filter(word => heard.has(word)).length;
  return { expectedWords: expected.length, matchedWords, coverage: Number((matchedWords / expected.length).toFixed(2)) };
}

async function transcribeAudio(audio, apiKey, target) {
  const body = new FormData();
  body.append('model', 'gpt-4o-mini-transcribe');
  body.append('file', audio, audio.name || 'pronunciation-attempt.webm');
  body.append('language', 'en');
  body.append('prompt', `English pronunciation practice. Expected phrase: ${shortText(target, 280)}`);
  body.append('response_format', 'json');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body });
  if (!response.ok) throw new Error(`Transcription request failed (${response.status})`);
  const data = await response.json();
  return shortText(data.text, 500);
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text;
  for (const item of response.output || []) for (const content of item.content || []) if (content.type === 'output_text' && content.text) return content.text;
  return '';
}

async function coach({ target, ipa, category, practiceStage, firstLanguage, transcript, audioMetrics, audioEvidence, visualMetrics, visualFrame }, apiKey) {
  const content = [{ type: 'input_text', text: `You are SpeakUp, a concise English pronunciation and career-speech coach in New Zealand.\nTarget: ${target}\nIPA: ${ipa || '[not supplied]'}\nStage: ${practiceStage || 'practice'}\nCategory: ${category}\nFirst language: ${firstLanguage || '[not supplied]'}\nTranscript: ${transcript || '[not captured]'}\nAudio evidence: ${JSON.stringify({ ...audioEvidence, durationMs: audioMetrics?.durationMs || 0 })}\nOn-device visible-mouth metrics: ${JSON.stringify(visualMetrics)}\nUse supplied evidence only. Transcript coverage is not phoneme accuracy. Do not claim to see a hidden tongue or diagnose a phoneme from a single image. Give exactly one success and one highest-impact retry action. Prefer intelligibility, stress, rhythm, and clear workplace delivery over imitating a native accent.` }];
  if (visualFrame && visualFrame.startsWith('data:image/')) content.push({ type: 'input_image', image_url: visualFrame, detail: 'low' });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini', store: false, input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'pronunciation_feedback', strict: true, schema: feedbackSchema } }
    })
  });
  if (!response.ok) throw new Error(`Coaching request failed (${response.status})`);
  return JSON.parse(extractOutputText(await response.json()));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request, env) });
    if (url.pathname === '/health') return json(request, env, { ok: true, service: 'speakup-coach-api', analysis: 'OpenAI audio transcription + optional vision coaching' });
    if (url.pathname === '/api/progress' && request.method === 'GET') {
      const limit = await enforceRateLimit(request, env, 'progress');
      if (!limit.allowed) return json(request, env, { error: 'Too many backup requests. Try again in a minute.' }, 429);
      try { return await readProgress(request, env); } catch (error) { console.error('progress_read_failed', error.message); return json(request, env, { error: 'Progress backup could not be read.' }, 502); }
    }
    if (url.pathname === '/api/progress' && request.method === 'PUT') {
      const limit = await enforceRateLimit(request, env, 'progress');
      if (!limit.allowed) return json(request, env, { error: 'Too many backup requests. Try again in a minute.' }, 429);
      try { return await writeProgress(request, env); } catch (error) { console.error('progress_write_failed', error.message); return json(request, env, { error: error.message === 'Progress backup is too large.' ? error.message : 'Progress backup could not be saved.' }, error.message === 'Progress backup is too large.' ? 413 : 502); }
    }
    if (url.pathname !== '/api/analyze' || request.method !== 'POST') return json(request, env, { error: 'Not found' }, 404);
    if (!env.OPENAI_API_KEY) return json(request, env, { error: 'OPENAI_API_KEY is not configured.' }, 503);

    const limit = await enforceRateLimit(request, env);
    if (!limit.allowed) return json(request, env, { error: 'Too many analysis requests. Try again in a minute.' }, 429);
    const dailyBudget = await enforceDailyOpenAiBudget(request, env);
    if (!dailyBudget.allowed) return json(request, env, { error: 'OpenAI practice limit reached for today. Your browser coach is still available.' }, 429);

    try {
      const form = await request.formData();
      const audio = form.get('audio');
      const target = String(form.get('target') || '').slice(0, 280);
      const ipa = String(form.get('ipa') || '').slice(0, 120);
      const category = String(form.get('category') || '').slice(0, 80);
      const practiceStage = String(form.get('practiceStage') || '').slice(0, 80);
      const firstLanguage = String(form.get('firstLanguage') || '').slice(0, 32);
      const audioMetrics = JSON.parse(String(form.get('audioMetrics') || '{}'));
      const visualMetrics = JSON.parse(String(form.get('visualMetrics') || '{}'));
      const visualFrame = String(form.get('visualFrame') || '');
      if (!(audio instanceof File) || !target) return json(request, env, { error: 'A target word and audio file are required.' }, 400);
      if (audio.size > MAX_AUDIO_BYTES) return json(request, env, { error: 'Audio must be smaller than 2 MB. Keep one practice attempt under 20 seconds.' }, 413);
      if (visualFrame.length > MAX_FRAME_CHARS) return json(request, env, { error: 'Visual frame is too large.' }, 413);

      const transcript = await transcribeAudio(audio, env.OPENAI_API_KEY, target);
      const audioEvidence = tokenCoverage(target, transcript);
      const feedback = await coach({ target, ipa, category, practiceStage, firstLanguage, transcript, audioMetrics, audioEvidence, visualMetrics, visualFrame }, env.OPENAI_API_KEY);
      return json(request, env, { ...feedback, transcript, evidence: { ...audioEvidence, durationMs: numberInRange(audioMetrics.durationMs, 0, 60000), note: 'Transcript coverage is not phoneme accuracy.' }, analysisSource: 'OpenAI transcription + GPT-4o mini coaching', mediaRetention: 'not retained by SpeakUp' });
    } catch (error) {
      console.error('analysis_failed', error.message);
      return json(request, env, { error: 'Analysis failed. Your local practice result was not changed.' }, 502);
    }
  }
};
