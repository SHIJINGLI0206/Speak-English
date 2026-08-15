const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_FRAME_CHARS = 450_000;

const feedbackSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'transcription', 'wellDone', 'toImprove', 'opening', 'rounding', 'tip', 'confidence'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    transcription: { type: 'string' },
    wellDone: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 },
    toImprove: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 },
    opening: { type: 'string', enum: ['Open', 'Moderate', 'Narrow', 'Not assessed'] },
    rounding: { type: 'string', enum: ['Rounded', 'Relaxed', 'Not assessed'] },
    tip: { type: 'string', maxLength: 180 },
    confidence: { type: 'string', enum: ['high', 'limited'] }
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: headers(request, env) });
}

async function enforceRateLimit(request, env) {
  if (!env.RATE_LIMIT) return { allowed: true };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const window = Math.floor(Date.now() / 60_000);
  const key = `analysis:${ip}:${window}`;
  const current = Number(await env.RATE_LIMIT.get(key) || 0);
  const limit = Number(env.MAX_ANALYSES_PER_MINUTE || 12);
  if (current >= limit) return { allowed: false };
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 120 });
  return { allowed: true };
}

async function transcribeAudio(audio, apiKey) {
  const body = new FormData();
  body.append('model', 'gpt-4o-mini-transcribe');
  body.append('file', audio, audio.name || 'pronunciation-attempt.webm');
  body.append('response_format', 'json');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body
  });
  if (!response.ok) throw new Error(`Transcription request failed (${response.status})`);
  const data = await response.json();
  return data.text || '';
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

async function coach({ target, ipa, category, transcript, visualMetrics, visualFrame }, apiKey) {
  const content = [{
    type: 'input_text',
    text: `You are SpeakUp, a concise English pronunciation coach for a senior AI engineer in New Zealand.\n\nTarget word: ${target}\nIPA reference: ${ipa}\nPractice category: ${category}\nAudio transcription: ${transcript || '[not captured]'}\nLocal visible-mouth metrics: ${JSON.stringify(visualMetrics)}\n\nUse only the supplied evidence. A transcription match is not proof of perfect pronunciation. Never claim to see hidden tongue positions. If the image or metrics are unclear, use \"Not assessed\" and lower confidence. Give exactly one specific success and one highest-impact next action, each in plain English. Keep the tip under 180 characters.`
  }];
  if (visualFrame && visualFrame.startsWith('data:image/')) {
    content.push({ type: 'input_image', image_url: visualFrame, detail: 'low' });
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'none' },
      input: [{ role: 'user', content }],
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
    if (url.pathname === '/health') return json(request, env, { ok: true, service: 'speakup-coach-api' });
    if (url.pathname !== '/api/analyze' || request.method !== 'POST') return json(request, env, { error: 'Not found' }, 404);
    if (!env.OPENAI_API_KEY) return json(request, env, { error: 'OPENAI_API_KEY is not configured.' }, 503);

    const limit = await enforceRateLimit(request, env);
    if (!limit.allowed) return json(request, env, { error: 'Too many analysis requests. Try again in a minute.' }, 429);

    try {
      const form = await request.formData();
      const audio = form.get('audio');
      const target = String(form.get('target') || '').slice(0, 80);
      const ipa = String(form.get('ipa') || '').slice(0, 120);
      const category = String(form.get('category') || '').slice(0, 80);
      const visualMetrics = JSON.parse(String(form.get('visualMetrics') || '{}'));
      const visualFrame = String(form.get('visualFrame') || '');
      if (!(audio instanceof File) || !target) return json(request, env, { error: 'A target word and audio file are required.' }, 400);
      if (audio.size > MAX_AUDIO_BYTES) return json(request, env, { error: 'Audio must be smaller than 8 MB.' }, 413);
      if (visualFrame.length > MAX_FRAME_CHARS) return json(request, env, { error: 'Visual frame is too large.' }, 413);

      const transcript = await transcribeAudio(audio, env.OPENAI_API_KEY);
      const feedback = await coach({ target, ipa, category, transcript, visualMetrics, visualFrame }, env.OPENAI_API_KEY);
      return json(request, env, { ...feedback, transcript, analysisSource: 'OpenAI transcription + GPT-5.6 Luna' });
    } catch (error) {
      console.error('analysis_failed', error.message);
      return json(request, env, { error: 'Analysis failed. Your local practice result was not changed.' }, 502);
    }
  }
};
