/**
 * Voice Engine and Evaluation Coach for SpeakUp
 * Handles Text-to-Speech playback, speech recognition, audio recording,
 * transcript-based clarity checks. Audio is kept in-browser in this static
 * deployment; cloud scoring belongs behind a server, never an API key field.
 *
 * iOS Safari Compatibility Notes:
 * - MediaRecorder is NOT supported on iOS Safari — gracefully skipped.
 * - SpeechRecognition.onend does NOT reliably fire on iOS when .stop() is
 *   called manually. We use a flag + direct invocation pattern instead.
 * - A fresh SpeechRecognition instance must be created for every session.
 */

const VoiceCoach = {
  recognition: null,
  isRecording: false,

  // Stored callbacks so stopPractice() can trigger them directly on iOS
  _onComplete: null,
  _onUpdate: null,
  _transcribedText: '',
  _practiceArgs: null, // { targetWord, targetIpa, category }
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  audioBlob: null,
  audioStartedAt: 0,

  // Detect iOS Safari
  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  // Play a browser-provided NZ English voice when available. Reference audio remains
  // a listening aid, not a claim of one "correct" accent.
  speak(text, onEnd) {
    if (!('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Load voices — on iOS they may not be available synchronously
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      let preferredVoice = voices.find(v => v.lang === 'en-NZ');
      if (!preferredVoice) preferredVoice = voices.find(v => v.lang === 'en-AU' || v.lang === 'en-GB');
      if (!preferredVoice) preferredVoice = voices.find(v => v.lang.startsWith('en'));
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      if (onEnd) utterance.onend = onEnd;
      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      trySpeak();
    } else {
      // Wait for voices to load (needed on iOS)
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        trySpeak();
      };
    }
  },

  // Starts recording voice and runs recognition
  async startPractice(targetWord, targetIpa, category, stage, firstLanguage, onUpdate, onComplete, onError) {
    // Always create a fresh instance — iOS requires this
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      // Fallback: browser has no speech recognition; run local eval after 3s timer
      this.isRecording = true;
      this._onComplete = onComplete;
      this._onUpdate = onUpdate;
      this._transcribedText = '';
      this._practiceArgs = { targetWord, targetIpa, category, stage, firstLanguage };
      this.audioBlob = null;
      this.startAudioCapture().catch(error => console.warn('Audio capture unavailable:', error));
      onUpdate('listening');
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = true;   // Keep mic open until we manually stop
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-NZ';
    this.recognition.maxAlternatives = 1;

    // Store state
    this.isRecording = true;
    this._onComplete = onComplete;
    this._onUpdate = onUpdate;
    this._transcribedText = '';
    this._practiceArgs = { targetWord, targetIpa, category, stage, firstLanguage };
    this.audioBlob = null;
    this.startAudioCapture().catch(error => console.warn('Audio capture unavailable:', error));

    // SpeechRecognition remains a fast local hint. The optional Worker receives the
    // captured audio after the learner finishes, never an API key from the browser.

    this.recognition.onstart = () => {
      onUpdate('listening');
    };

    this.recognition.onresult = (event) => {
      // Accumulate the latest final/interim result
      let latest = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        latest += event.results[i][0].transcript;
      }
      if (latest) this._transcribedText = latest;
    };

    this.recognition.onerror = (event) => {
      // 'no-speech' is normal — don't treat it as fatal
      if (event.error === 'no-speech') return;
      console.warn('SpeechRecognition error:', event.error);
    };

    // onend may or may not fire on iOS when we call .stop() — we do NOT rely on it.
    // Instead, stopPractice() calls _finishAnalysis() directly.
    this.recognition.onend = () => {
      // If isRecording is still true here, it means iOS auto-stopped (e.g. silence timeout).
      // Trigger finish ourselves.
      if (this.isRecording) {
        this._finishAnalysis();
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.error('recognition.start() failed:', e);
      if (onError) onError('Could not start microphone. Please allow mic access and try again.');
      this.isRecording = false;
      this.stopAudioCapture();
    }
  },

  // Called by the "Tap to Finish" button — works reliably on both iOS and desktop
  stopPractice() {
    if (!this.isRecording) return;
    this._finishAnalysis();
  },

  // Core completion handler — called either from stopPractice() or recognition.onend
  _finishAnalysis() {
    if (!this.isRecording) return; // Guard against double-call
    this.isRecording = false;

    // Stop recognition if still running
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) { /* safe to ignore */ }
    }

    const { targetWord, targetIpa, category, stage, firstLanguage } = this._practiceArgs || {};
    const onUpdate = this._onUpdate;
    const onComplete = this._onComplete;
    const transcript = this._transcribedText;

    if (onUpdate) onUpdate('analyzing');

    const visualMetrics = typeof MouthTracker !== 'undefined' ? MouthTracker.getLatestMetrics() : {};
    const settings = typeof StorageManager !== 'undefined' ? StorageManager.getSettings() : {};
    // A frame is transmitted only after explicit learner consent. Local landmarks remain local.
    const visualFrame = settings.shareVisualEvidence && typeof MouthTracker !== 'undefined' ? MouthTracker.captureFrame() : '';

    // Small delay so the UI can update to "Analyzing..." before heavy work
    setTimeout(async () => {
      const audio = await this.stopAudioCapture();
      const audioMetrics = { durationMs: Math.max(0, Date.now() - this.audioStartedAt), bytes: audio?.size || 0 };
      let report = null;
      try {
        report = await this.analyzeWithCloud(audio, targetWord, targetIpa, category, stage, firstLanguage, audioMetrics, visualMetrics, visualFrame);
      } catch (error) {
        console.warn('Cloud analysis unavailable; using local clarity fallback.', error);
      }
      report = report || this.evaluateLocally(targetWord, targetIpa, category, transcript);
      setTimeout(() => { if (onComplete) onComplete(report); }, 350);
    }, 200);
  },

  async startAudioCapture() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return;
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const supported = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    this.mediaRecorder = supported ? new MediaRecorder(this.mediaStream, { mimeType: supported }) : new MediaRecorder(this.mediaStream);
    this.audioChunks = [];
    this.audioStartedAt = Date.now();
    this.mediaRecorder.ondataavailable = event => { if (event.data && event.data.size) this.audioChunks.push(event.data); };
    this.mediaRecorder.start();
  },

  async stopAudioCapture() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return this.audioBlob;
    return new Promise(resolve => {
      const recorder = this.mediaRecorder;
      recorder.onstop = () => {
        this.audioBlob = this.audioChunks.length ? new Blob(this.audioChunks, { type: recorder.mimeType || 'audio/webm' }) : null;
        if (this.mediaStream) this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
        this.mediaRecorder = null;
        resolve(this.audioBlob);
      };
      recorder.stop();
    });
  },

  async analyzeWithCloud(audio, target, ipa, category, stage, firstLanguage, audioMetrics, visualMetrics, visualFrame) {
    const savedSettings = typeof StorageManager !== 'undefined' ? StorageManager.getSettings() : {};
    const apiBaseUrl = savedSettings.apiBaseUrl || (window.SPEAKUP_CONFIG && window.SPEAKUP_CONFIG.apiBaseUrl);
    if (!savedSettings.cloudCoach || !apiBaseUrl || !audio || !audio.size) return null;
    const form = new FormData();
    const extension = audio.type.includes('mp4') ? 'm4a' : 'webm';
    form.append('audio', audio, `attempt.${extension}`);
    form.append('target', target || '');
    form.append('ipa', ipa || '');
    form.append('category', category || '');
    form.append('practiceStage', stage || '');
    form.append('firstLanguage', firstLanguage || '');
    form.append('audioMetrics', JSON.stringify(audioMetrics || {}));
    form.append('visualMetrics', JSON.stringify(visualMetrics || {}));
    if (visualFrame) form.append('visualFrame', visualFrame);
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/analyze`, { method: 'POST', body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Worker request failed (${response.status})`);
    return {
      score: payload.score,
      transcription: payload.transcription || payload.transcript || '[Inaudible]',
      wellDone: payload.wellDone || ['AI feedback was unavailable for this attempt.'],
      toImprove: payload.toImprove || ['Try the reference word once more.'],
      cvMetrics: { opening: payload.opening, rounding: payload.rounding, tip: payload.tip },
      evidence: { transcriptConfidence: payload.confidence || 'limited', visualConfidence: visualMetrics && visualMetrics.confidence || 'not assessed', analysisSource: payload.analysisSource, audioEvidence: payload.evidence || null }
    };
  },

  // Honest local fallback: a transcript clarity check, not phoneme scoring.
  evaluateLocally(target, ipa, category, transcript) {
    const targetClean = (target || '').toLowerCase().trim().replace(/[^a-z\s]/g, '');
    const transcriptClean = (transcript || '').toLowerCase().trim().replace(/[^a-z\s]/g, '');

    let score, wellDone, toImprove;

    if (transcriptClean === targetClean && transcriptClean.length > 0) {
      score = 92;
      wellDone = ['The recogniser heard the target word clearly.'];
      toImprove = ['Repeat once more while copying the reference rhythm.'];
    } else if (transcriptClean.length === 0) {
      score = 45;
      wellDone = ['The attempt was saved for your practice streak.'];
      toImprove = ['The browser could not capture a transcript. Check microphone permission and try the word once more.'];
    } else {
      const distance = this.levenshtein(targetClean, transcriptClean);
      score = Math.max(55, Math.round(86 - (distance / Math.max(targetClean.length, 1)) * 35));
      wellDone = ['You completed a clear spoken attempt.'];

      if (category === 'Consonant contrast') {
        toImprove = ['Slow down once and make the contrast visible and audible before returning to normal speed.'];
      } else if (category === 'Word endings') {
        toImprove = ['Release the final consonant instead of swallowing the word ending.'];
      } else if (category === 'Prosody') {
        toImprove = ['Stress the key word, then keep the small connecting words lighter.'];
      } else if (category === 'Career transfer') {
        toImprove = ['Pause before your key point and deliver one clear idea per sentence.'];
      } else if (category === 'V/W Sounds') {
        if (targetClean.startsWith('w')) {
          toImprove = ['Round your lips tightly for the /w/ sound, avoiding /v/ friction.'];
        } else {
          toImprove = ['Gently touch your upper teeth to your lower lip for /v/.'];
        }
      } else if (category === 'Final Consonants') {
        toImprove = ['Release the final consonant sound clearly.', 'Do not swallow the word ending.'];
      } else {
        toImprove = ['Focus on matching the core vowel height and positioning.'];
      }
    }

    return {
      score,
      transcription: transcript && transcript.length > 0 ? transcript : '[Inaudible]',
      wellDone,
      toImprove,
      cvMetrics: { opening: 'Not assessed', rounding: 'Not assessed', tip: 'Visible-mouth feedback appears only when the camera has a clear face landmark result.' }
    };
  },

  levenshtein(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const saved = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = saved;
      }
    }
    return row[b.length];
  }
};
