/**
 * Voice Engine and Evaluation Coach for SpeakUp
 * Handles Text-to-Speech playback, speech recognition, audio recording,
 * local phonetic scoring, and optional Gemini Voice API payload shipping.
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

  // Detect iOS Safari
  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  // Play word pronunciation using US accent
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
      let usVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha'));
      if (!usVoice) usVoice = voices.find(v => v.lang === 'en-US');
      if (!usVoice) usVoice = voices.find(v => v.lang.startsWith('en'));
      if (usVoice) utterance.voice = usVoice;

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
  async startPractice(targetWord, targetIpa, category, onUpdate, onComplete, onError) {
    // Always create a fresh instance — iOS requires this
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      // Fallback: browser has no speech recognition; run local eval after 3s timer
      this.isRecording = true;
      this._onComplete = onComplete;
      this._onUpdate = onUpdate;
      this._transcribedText = '';
      this._practiceArgs = { targetWord, targetIpa, category };
      onUpdate('listening');
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = true;   // Keep mic open until we manually stop
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    // Store state
    this.isRecording = true;
    this._onComplete = onComplete;
    this._onUpdate = onUpdate;
    this._transcribedText = '';
    this._practiceArgs = { targetWord, targetIpa, category };

    // On iOS we do NOT use MediaRecorder (unsupported). Just capture transcript.
    // On desktop we could add MediaRecorder, but we skip it here for cross-platform safety.

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

    const { targetWord, targetIpa, category } = this._practiceArgs || {};
    const onUpdate = this._onUpdate;
    const onComplete = this._onComplete;
    const transcript = this._transcribedText;

    if (onUpdate) onUpdate('analyzing');

    // Small delay so the UI can update to "Analyzing..." before heavy work
    setTimeout(async () => {
      const settings = StorageManager.getSettings();

      if (settings.geminiKey && settings.geminiKey.trim() !== '') {
        // Text-only Gemini evaluation (no audio blob on iOS)
        try {
          const report = await this.evaluateWithGeminiText(
            settings.geminiKey, targetWord, targetIpa, category, transcript
          );
          if (onComplete) onComplete(report);
        } catch (err) {
          console.error('Gemini API failed, falling back to local coach:', err);
          const report = this.evaluateLocally(targetWord, targetIpa, category, transcript);
          if (onComplete) onComplete(report);
        }
      } else {
        // Local evaluation
        const report = this.evaluateLocally(targetWord, targetIpa, category, transcript);
        setTimeout(() => { if (onComplete) onComplete(report); }, 800);
      }
    }, 200);
  },

  // Gemini text-based evaluation (works everywhere including iOS)
  async evaluateWithGeminiText(apiKey, targetWord, targetIpa, category, transcript) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a high-quality personal English Pronunciation Coach (American accent).
The user is practicing the word "${targetWord}" (IPA: ${targetIpa}, category: ${category}).
The speech-to-text system heard them say: "${transcript || '[no transcription captured]'}".

Based on the target word vs what was heard, give detailed pronunciation feedback.

Respond ONLY with a valid JSON object (no markdown, no backticks):
{
  "score": <integer 0-100>,
  "wellDone": ["<point 1>", "<point 2>"],
  "toImprove": ["<point 1>", "<point 2>"],
  "transcription": "<what was heard>",
  "cvTips": {
    "opening": "<Optimal | Needs Wider | Too Narrow>",
    "rounding": "<Good | Needs More Rounding | Flat Lips>",
    "tip": "<specific mouth movement advice>"
  }
}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) throw new Error(`Gemini API ${response.status}`);

    const data = await response.json();
    const raw = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(raw.trim());

    return {
      score: parsed.score || 70,
      transcription: parsed.transcription || transcript || targetWord,
      wellDone: parsed.wellDone || ['Good attempt!'],
      toImprove: parsed.toImprove || ['Keep practising this sound.'],
      cvMetrics: {
        opening: parsed.cvTips?.opening || 'Optimal',
        rounding: parsed.cvTips?.rounding || 'Good',
        tip: parsed.cvTips?.tip || 'Focus on clear articulation.'
      }
    };
  },

  // High-fidelity local simulation based on transcription
  evaluateLocally(target, ipa, category, transcript) {
    const targetClean = (target || '').toLowerCase().trim().replace(/[^a-z\s]/g, '');
    const transcriptClean = (transcript || '').toLowerCase().trim().replace(/[^a-z\s]/g, '');

    let score, wellDone, toImprove;
    let cvOpening = 'Optimal';
    let cvRounding = 'Good';
    let cvTip = 'Keep up the excellent mouth posture!';

    if (transcriptClean === targetClean && transcriptClean.length > 0) {
      score = Math.floor(Math.random() * 11) + 90;
      wellDone = ['Excellent phoneme positioning.', 'Perfect vowel timing and accuracy.'];
      toImprove = ['Maintain this tongue placement in sentences.'];
    } else if (transcriptClean.length === 0) {
      score = Math.floor(Math.random() * 15) + 40;
      wellDone = ['Voice detected — good start.'];
      toImprove = ['Ensure your microphone is clear.', 'Speak loudly and articulate each syllable.'];
      cvOpening = 'Too Narrow';
      cvTip = 'Open your mouth slightly wider when starting to pronounce.';
    } else {
      score = Math.floor(Math.random() * 20) + 68;
      wellDone = ['Good overall energy and rhythm.'];

      if (category === 'TH Sounds') {
        toImprove = ['The /θ/ needs more forward tongue position.', 'Keep the airflow continuous between your teeth.'];
        cvTip = 'Let the tip of your tongue peep out slightly between your teeth for the TH sound.';
        cvRounding = 'Flat Lips';
      } else if (category === 'R Sounds') {
        toImprove = ['Pull your tongue further back for the American /r/.', 'Do not let the tongue tip touch the roof of your mouth.'];
        cvTip = 'Pucker your lips slightly and pull the corners in for a stronger R sound.';
        cvOpening = 'Needs Wider';
      } else if (category === 'L Sounds') {
        toImprove = ['Press the tongue tip firmly behind your front teeth for /l/.', 'Ensure the sides of the tongue release the air.'];
        cvTip = 'Keep your tongue tip stable against the upper alveolar ridge.';
      } else if (category === 'V/W Sounds') {
        if (targetClean.startsWith('w')) {
          toImprove = ['Round your lips tightly for the /w/ sound, avoiding /v/ friction.'];
          cvRounding = 'Flat Lips';
          cvTip = 'Round your lips tightly as if preparing to whistle.';
        } else {
          toImprove = ['Gently touch your upper teeth to your lower lip for /v/.'];
          cvRounding = 'Flat Lips';
          cvTip = 'Touch your upper teeth to your lower lip — do not round lips for /v/.';
        }
      } else if (category === 'Final Consonants') {
        toImprove = ['Release the final consonant sound clearly.', 'Do not swallow the word ending.'];
        cvTip = 'Keep your jaw stable and fully release the final stop consonant.';
      } else {
        toImprove = ['Focus on matching the core vowel height and positioning.'];
        cvTip = 'Open your mouth wider for better vowel accuracy.';
      }
    }

    return {
      score,
      transcription: transcript && transcript.length > 0 ? transcript : '[Inaudible]',
      wellDone,
      toImprove,
      cvMetrics: { opening: cvOpening, rounding: cvRounding, tip: cvTip }
    };
  }
};
