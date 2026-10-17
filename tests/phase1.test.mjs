import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import coachWorker from '../api-worker/src/index.js';

const context = vm.createContext({ Date });
vm.runInContext(readFileSync(new URL('../js/wordGenerator.js', import.meta.url), 'utf8'), context);
const Curriculum = vm.runInContext('Curriculum', context);

test('mastery needs an eligible delayed review, not an aged score', () => {
  const now = Date.now();
  const daysAgo = days => now - days * 86400000;
  const attempt = (days, format, score, extra = {}) => ({
    skillId: 'v-w', target: 'work', format, score, timestamp: daysAgo(days),
    date: new Date(daysAgo(days)).toISOString().slice(0, 10), masteryEligible: format !== 'Listening', ...extra
  });
  const history = [attempt(20, 'Word', 90), attempt(15, 'Word', 88), attempt(10, 'Word', 91),
    attempt(7, 'Word', 89), attempt(5, 'Sentence', 90), attempt(4, 'Listening', 96), attempt(3, 'Listening', 96)];
  assert.equal(Curriculum.progress(history, 'v-w').ready, false);
  assert.equal(Curriculum.progress(history, 'v-w').scores.retention, null);
  history.push(attempt(0, 'Word', 88, { stage: 'Review', reviewOf: history[3].timestamp }));
  assert.equal(Curriculum.progress(history, 'v-w').ready, true);
  assert.equal(Curriculum.progress(history, 'v-w').scores.retention, 88);
  assert.equal(Curriculum.dueReviews(history).some(item => item.timestamp === history[3].timestamp), false);
});

test('unverified transcript hints do not unlock production skills', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ skillId: 'v-w', format: 'Word',
    score: 100, timestamp: Date.now() - (index + 7) * 86400000,
    date: `2026-10-${String(index + 1).padStart(2, '0')}` }));
  assert.equal(Curriculum.progress(history, 'v-w').clear, 0);
  assert.equal(Curriculum.progress(history, 'v-w').scores.word, null);
});

test('short audio is rejected before an OpenAI call', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('OpenAI should not be called'); };
  try {
    const form = new FormData();
    form.set('target', 'work');
    form.set('audioMetrics', JSON.stringify({ durationMs: 200, quality: 'retry' }));
    form.set('audio', new File([new Uint8Array(1200)], 'attempt.webm', { type: 'audio/webm' }));
    const response = await coachWorker.fetch(new Request('https://worker.example/api/analyze', { method: 'POST', body: form }), { OPENAI_API_KEY: 'test-key' });
    assert.equal(response.status, 422);
  } finally { globalThis.fetch = originalFetch; }
});

test('transcription logprobs produce a reliability state, not a phoneme score', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if (String(url).endsWith('/audio/transcriptions')) return Response.json({ text: 'work', logprobs: [{ token: 'work', logprob: -0.1 }] });
    return Response.json({ output_text: JSON.stringify({ score: 86, transcription: 'work',
      wellDone: ['The word was recognised.'], toImprove: ['Repeat with a relaxed vowel.'],
      opening: 'Moderate', rounding: 'Relaxed', tip: 'Watch your lips.', confidence: 'high' }) });
  };
  try {
    const form = new FormData();
    form.set('target', 'work');
    form.set('audioMetrics', JSON.stringify({ durationMs: 1200, quality: 'good' }));
    form.set('audio', new File([new Uint8Array(2000)], 'attempt.webm', { type: 'audio/webm' }));
    const response = await coachWorker.fetch(new Request('https://worker.example/api/analyze', { method: 'POST', body: form }), { OPENAI_API_KEY: 'test-key' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.transcriptConfidence, 'high');
    assert.equal(result.evidence.coverage, 1);
    assert.match(result.evidence.note, /not phoneme accuracy/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('adaptive practice returns bounded new words without media', async () => {
  const originalFetch = globalThis.fetch;
  let prompt = '';
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/responses$/);
    prompt = JSON.stringify(JSON.parse(options.body).input);
    return Response.json({ output_text: JSON.stringify({ items: [
      { target: 'review', ipa: '/rɪˈvjuː/', sentence: 'We will review the plan tomorrow.' },
      { target: 'value', ipa: '/ˈvæljuː/', sentence: 'The value is clear to our customers.' }
    ] }) });
  };
  try {
    const response = await coachWorker.fetch(new Request('https://worker.example/api/practice-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'v-w', skillName: 'V / W contrast', cue: 'Watch the lips',
        recent: [{ target: 'very', score: 70, toImprove: 'Try V again.' }] })
    }), { OPENAI_API_KEY: 'test-key' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items[0].target, 'review');
    assert.equal(body.mediaRetention, 'no media sent');
    assert.match(prompt, /very/);
    assert.doesNotMatch(prompt, /audio\/webm|data:image/);
  } finally { globalThis.fetch = originalFetch; }
});

test('OpenAI quota errors are classified without exposing the API key', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  globalThis.fetch = async () => Response.json({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } }, { status: 429 });
  try {
    const response = await coachWorker.fetch(new Request('https://worker.example/api/practice-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skillId: 'v-w' })
    }), { OPENAI_API_KEY: 'test-key' });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.match(text, /credit_balance_exhausted/);
    assert.doesNotMatch(text, /test-key/);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});
