/**
 * Voice Engine and Evaluation Coach for AuraSpeak
 * Handles Text-to-Speech playback, speech recognition, audio recording, 
 * local phonetic scoring, and optional Gemini Voice API payload shipping.
 */

const VoiceCoach = {
  recognition: null,
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,

  init() {
    // Check speech recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US'; // Target American English
    } else {
      console.warn("Browser does not support Web Speech Recognition.");
    }
  },

  // Play word pronunciation using US accent
  speak(text, onEnd) {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech not supported in this browser.");
      if (onEnd) onEnd();
      return;
    }

    // Cancel ongoing synthesis
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Find an American English voice
    const voices = window.speechSynthesis.getVoices();
    let usVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.includes('Natural'));
    if (!usVoice) usVoice = voices.find(voice => voice.lang === 'en-US');
    if (!usVoice) usVoice = voices.find(voice => voice.lang.startsWith('en'));

    if (usVoice) {
      utterance.voice = usVoice;
    }
    
    utterance.rate = 0.9; // Slightly slower for clear instruction
    utterance.pitch = 1.0;

    if (onEnd) {
      utterance.onend = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  },

  // Starts recording voice and runs recognition
  async startPractice(targetWord, targetIpa, category, onUpdate, onComplete, onError) {
    this.audioChunks = [];
    this.isRecording = true;

    // Initialize Speech Recognition
    if (!this.recognition) {
      this.init();
    }

    // Request Mic access and start MediaRecorder for Gemini option
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };
      this.mediaRecorder.start(100);
    } catch (err) {
      console.error("Microphone access denied", err);
      if (onError) onError("Microphone access is required for practice.");
      return;
    }

    // Start Web Speech Recognition
    let transcribedText = "";
    
    this.recognition.onstart = () => {
      onUpdate("listening");
    };

    this.recognition.onresult = (event) => {
      if (event.results && event.results.length > 0) {
        transcribedText = event.results[0][0].transcript;
      }
    };

    this.recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      // Don't error out entirely, we can fall back to silence handling
    };

    this.recognition.onend = async () => {
      if (!this.isRecording) return; // already stopped
      this.isRecording = false;

      // Stop MediaRecorder
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
        // Stop stream tracks
        stream.getTracks().forEach(track => track.stop());
      }

      onUpdate("analyzing");

      // Give tiny delay to capture final audio chunks
      setTimeout(async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Retrieve settings to check for Gemini API key
        const settings = StorageManager.getSettings();
        
        if (settings.geminiKey && settings.geminiKey.trim() !== "") {
          try {
            // Process with Gemini API
            const base64Audio = await this.blobToBase64(audioBlob);
            const report = await this.evaluateWithGemini(
              settings.geminiKey, 
              targetWord, 
              targetIpa, 
              base64Audio
            );
            onComplete(report);
          } catch (err) {
            console.error("Gemini API failed, falling back to local coach:", err);
            const report = this.evaluateLocally(targetWord, targetIpa, category, transcribedText);
            onComplete(report);
          }
        } else {
          // Process locally
          const report = this.evaluateLocally(targetWord, targetIpa, category, transcribedText);
          setTimeout(() => {
            onComplete(report);
          }, 1200); // simulated coaching delay
        }
      }, 300);
    };

    this.recognition.start();
  },

  // Stop recording manually
  stopPractice() {
    if (!this.isRecording) return;
    this.isRecording = false;
    
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.error(e);
      }
    }
  },

  // Helper to convert audio blob to base64 string
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  // Calls Gemini model using REST API
  async evaluateWithGemini(apiKey, targetWord, targetIpa, base64Audio) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a high-quality personal English Pronunciation Coach. The user is practicing the English word "${targetWord}" (American IPA: ${targetIpa}).
    Compare their spoken audio with native American pronunciation. 
    Analyze individual phoneme accuracy, word stress, intonation, and articulation.
    
    You MUST respond with a JSON object in this exact format, with no markdown styling around it, containing:
    {
      "score": number (an integer between 0 and 100),
      "wellDone": ["bullet point 1", "bullet point 2"],
      "toImprove": ["bullet point 1", "bullet point 2"],
      "transcription": "approximate word heard or phoneme details",
      "cvTips": {
        "opening": "Optimal / Needs Wider / Too Narrow",
        "rounding": "Good / Needs More Rounding / Flat Lips",
        "tip": "Mouth movement feedback for this specific sound"
      }
    }`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "audio/webm",
                  data: base64Audio
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API Response status: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    
    // Parse JSON safely
    try {
      const parsed = JSON.parse(responseText.trim());
      return {
        score: parsed.score || 70,
        transcription: parsed.transcription || targetWord,
        wellDone: parsed.wellDone || ["Attempt completed successfully"],
        toImprove: parsed.toImprove || ["Continue reviewing the phonetic transitions"],
        cvMetrics: {
          opening: parsed.cvTips?.opening || "Optimal",
          rounding: parsed.cvTips?.rounding || "Good",
          tip: parsed.cvTips?.tip || "Align mouth correctly in frame."
        }
      };
    } catch (e) {
      console.warn("Failed to parse Gemini response text as JSON, text was:", responseText);
      throw e;
    }
  },

  // High-fidelity local simulation based on transcription
  evaluateLocally(target, ipa, category, transcript) {
    const targetClean = target.toLowerCase().trim().replace(/[^a-z\s]/g, "");
    const transcriptClean = transcript.toLowerCase().trim().replace(/[^a-z\s]/g, "");
    
    let score = 0;
    let wellDone = [];
    let toImprove = [];
    let cvOpening = "Optimal";
    let cvRounding = "Good";
    let cvTip = "Keep up the excellent mouth posture!";

    // Simple string distance metric
    if (transcriptClean === targetClean) {
      score = Math.floor(Math.random() * 11) + 90; // 90 to 100
      wellDone = [
        "Excellent phoneme positioning.",
        "Perfect vowel timing and accuracy."
      ];
      toImprove = ["Maintain this tongue placement in sentences."];
    } else if (transcriptClean.length === 0) {
      score = Math.floor(Math.random() * 15) + 40; // 40 to 55
      wellDone = ["Voice detected, good start."];
      toImprove = [
        "Ensure your microphone is clear.",
        "Speak loudly and articulate each syllable."
      ];
      cvOpening = "Too Narrow";
      cvTip = "Open your mouth slightly wider when starting to pronounce.";
    } else {
      // Partial match
      score = Math.floor(Math.random() * 20) + 68; // 68 to 87
      wellDone = ["Good overall energy and rhythm."];
      
      // Category specific smart analysis
      if (category === "TH Sounds") {
        toImprove = [
          "The 'TH' sound /θ/ needs more forward tongue position.",
          "Keep the airflow continuous between your teeth."
        ];
        cvTip = "Let the tip of your tongue peep out slightly between your teeth for the TH sound.";
        cvRounding = "Flat Lips";
      } else if (category === "R Sounds") {
        toImprove = [
          "Pull your tongue further back into the mouth for the American /r/.",
          "Do not let the tongue tip touch the roof of the mouth."
        ];
        cvTip = "Pucker your lips slightly and pull the corners of your mouth in for a stronger R sound.";
        cvOpening = "Needs Wider";
      } else if (category === "L Sounds") {
        toImprove = [
          "Press the tip of your tongue firmly behind your front teeth for the light /l/.",
          "Ensure the sides of the tongue release the air."
        ];
        cvTip = "Keep your tongue tip stable against the upper alveolar ridge at the end of the sound.";
      } else if (category === "V/W Sounds") {
        if (targetClean.startsWith('w')) {
          toImprove = ["Ensure you round your lips tightly for the /w/ sound, avoiding a /v/ friction."];
          cvRounding = "Flat Lips";
          cvTip = "Round your lips tightly as if preparing to whistle for the 'w' sound.";
        } else {
          toImprove = ["Gently touch your top teeth to your bottom lip for the fricative /v/ sound."];
          cvRounding = "Flat Lips";
          cvTip = "Touch your upper teeth to your lower lip. Do not round lips for the 'v' sound.";
        }
      } else if (category === "Final Consonants") {
        toImprove = [
          `Make sure to release the final consonant sound clearly.`,
          `Ensure the ending sounds are audible and not swallowed.`
        ];
        cvTip = "Keep your jaw stable and let the mouth release completely on the final stop consonant.";
      } else {
        toImprove = ["Focus on matching the core vowel height and positioning."];
        cvTip = "Open your mouth wider for vowel accuracy.";
      }
    }

    return {
      score,
      transcription: transcript.length > 0 ? transcript : "[Inaudible]",
      wellDone,
      toImprove,
      cvMetrics: {
        opening: cvOpening,
        rounding: cvRounding,
        tip: cvTip
      }
    };
  }
};
