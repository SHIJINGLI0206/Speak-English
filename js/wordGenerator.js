/**
 * Word Generator & Vocabulary Database for SpeakUp
 * Provides phonetic IPA dictionary, sound categories, and spaced-repetition daily word scheduling.
 */

const VocabularyDatabase = {
  // Accent dictionary mapping words to US IPA
  IPA_DICTIONARY: {
    // Baseline Day 1
    "water": "/ˈwɑː.t̬ɚ/",
    "friend": "/frɛnd/",
    "family": "/ˈfæm.əl.i/",
    "school": "/skuːl/",
    "world": "/wɝːld/",
    "breakfast": "/ˈbrɛk.fəst/",
    "important": "/ɪmˈpɔːr.tənt/",
    "beautiful": "/ˈbjuː.t̬ɪ.fəl/",
    "vegetable": "/ˈvɛdʒ.tə.bəl/",
    "computer": "/kəmˈpjuː.t̬ɚ/",
    
    // TH Sounds
    "think": "/θɪŋk/",
    "thank": "/θæŋk/",
    "this": "/ðɪs/",
    "three": "/θriː/",
    "thing": "/θɪŋ/",
    "mouth": "/maʊθ/",
    "teeth": "/tiːθ/",
    "path": "/pæθ/",
    "both": "/boʊθ/",
    "birthday": "/ˈbɝːθ.deɪ/",
    "thought": "/θɑːt/",
    "thirsty": "/ˈθɝː.sti/",
    "threat": "/θrɛt/",
    "weather": "/ˈwɛð.ɚ/",
    "father": "/ˈfɑː.ðɚ/",
    "mother": "/ˈmʌð.ɚ/",
    "brother": "/ˈbrʌð.ɚ/",
    "healthy": "/ˈhɛl.θi/",
    "methodology": "/ˌmɛθ.əˈdɑː.lə.dʒi/",
    "therapeutic": "/ˌθɛr.əˈpjuː.tɪk/",
    "thorough": "/ˈθɝː.oʊ/",
    "thoughtlessness": "/ˈθɑːt.ləs.nəs/",
    "unsympathetic": "/ˌʌn.sɪm.pəˈθɛt̬.ɪk/",

    // R Sounds
    "right": "/raɪt/",
    "road": "/roʊd/",
    "really": "/ˈriː.ə.li/",
    "run": "/rʌn/",
    "red": "/rɛd/",
    "write": "/raɪt/",
    "rain": "/reɪn/",
    "room": "/ruːm/",
    "read": "/riːd/",
    "ring": "/rɪŋ/",
    "restaurant": "/ˈrɛs.tɚ.ɑːnt/",
    "remember": "/rɪˈmɛm.bɚ/",
    "priority": "/praɪˈɔːr.ə.t̬i/",
    "progress": "/ˈprɑː.ɡrɛs/",
    "direct": "/dɪˈrɛkt/",
    "library": "/ˈlaɪ.brɛr.i/",
    "direction": "/dɪˈrɛk.ʃən/",
    "representative": "/ˌrɛp.rɪˈzɛn.t̬ə.t̬ɪv/",
    "recursive": "/rɪˈkɝː.sɪv/",
    "reconstruct": "/ˌriː.kənˈstrʌkt/",
    "respiratory": "/ˈrɛs.pə.rə.tɔːr.i/",
    "characteristic": "/ˌkær.ək.təˈrɪs.tɪk/",

    // L Sounds
    "look": "/lʊk/",
    "little": "/ˈlɪt̬.əl/",
    "like": "/laɪk/",
    "live": "/lɪv/",
    "late": "/leɪt/",
    "long": "/lɑːŋ/",
    "love": "/lʌv/",
    "line": "/laɪn/",
    "left": "/lɛft/",
    "light": "/laɪt/",
    "yellow": "/ˈjɛl.oʊ/",
    "popular": "/ˈpɑː.pjə.lɚ/",
    "clean": "/kliːn/",
    "place": "/pleɪs/",
    "sleep": "/sliːp/",
    "building": "/ˈbɪl.dɪŋ/",
    "visual": "/ˈvɪʒ.u.əl/",
    "double": "/ˈdʌb.əl/",
    "literally": "/ˈlɪt̬.ɚ.ə.li/",
    "legislative": "/ˈlɛdʒ.ə.sleɪ.t̬ɪv/",
    "collection": "/kəˈlɛk.ʃən/",
    "correlation": "/ˌkɔːr.əˈleɪ.ʃən/",
    "technological": "/ˌtɛk.nəˈlɑː.dʒɪ.kəl/",

    // V/W Sounds
    "very": "/ˈvɛr.i/",
    "voice": "/vɔɪs/",
    "view": "/vjuː/",
    "volcano": "/vɑːlˈkeɪ.noʊ/",
    "value": "/ˈvæl.juː/",
    "heavy": "/ˈhɛv.i/",
    "evaluate": "/ɪˈvæl.ju.eɪt/",
    "vulnerability": "/ˌvʌl.nɚ.əˈbɪl.ə.t̬i/",
    "visualization": "/ˌvɪʒ.u.əl.əˈzeɪ.ʃən/",
    "wave-particle": "/weɪv ˈpɑːr.t̬ɪ.kəl/",
    "want": "/wɑːnt/",
    "walk": "/wɑːk/",
    "wait": "/weɪt/",
    "work": "/wɝːk/",
    "week": "/wiːk/",
    "whatever": "/wɑːtˈɛv.ɚ/",
    "window": "/ˈwɪn.doʊ/",
    "everywhere": "/ˈɛv.ri.wer/",
    "withdrawal": "/wɪðˈdrɑː.əl/",
    "unequivocally": "/ˌʌn.ɪˈkwɪv.ə.kli/",

    // Final Consonants
    "stop": "/stɑːp/",
    "help": "/hɛlp/",
    "desk": "/dɛsk/",
    "hand": "/hænd/",
    "cat": "/kæt/",
    "dog": "/dɔːɡ/",
    "cup": "/kʌp/",
    "map": "/mæp/",
    "project": "/ˈprɑː.dʒɛkt/",
    "perfect": "/ˈpɝː.fɪkt/",
    "product": "/ˈprɑː.dʌkt/",
    "dynamic": "/daɪˈnæm.ɪk/",
    "context": "/ˈkɑːn.tɛkst/",
    "respect": "/rɪˈspɛkt/",
    "development": "/dɪˈvɛl.əp.mənt/",
    "assessment": "/əˈsɛs.mənt/",
    "requirement": "/rɪˈkwaɪr.mənt/",
    "significance": "/sɪɡˈnɪf.ə.kəns/",
    "establishment": "/ɪˈstæb.lɪʃ.mənt/",

    // General Vowels
    "home": "/hoʊm/",
    "time": "/taɪm/",
    "food": "/fuːd/",
    "apple": "/ˈæp.əl/",
    "bed": "/bɛd/",
    "sit": "/sɪt/",
    "hot": "/hɑːt/",
    "customer": "/ˈkʌs.tə.mɚ/",
    "manager": "/ˈmæn.ə.dʒɚ/",
    "responsibility": "/rɪˌspɑːn.səˈbɪl.ə.t̬i/",
    "artificial intelligence": "/ˌɑːr.t̬ɪ.fɪʃ.əl ɪnˈtɛl.ə.dʒəns/",
    "communication": "/kəˌmjuː.nəˈkeɪ.ʃən/",
    "specification": "/ˌspɛs.ə.fəˈkeɪ.ʃən/"
  },

  // Words grouped by target sound category and difficulty
  WORDS_BY_CATEGORY: {
    "TH Sounds": {
      beginner: ["think", "thank", "this", "three", "thing", "mouth", "teeth", "path", "both", "birthday"],
      intermediate: ["thought", "thirsty", "threat", "weather", "father", "mother", "brother", "healthy"],
      advanced: ["methodology", "therapeutic", "thorough", "thoughtlessness", "unsympathetic"]
    },
    "R Sounds": {
      beginner: ["right", "road", "really", "run", "red", "write", "rain", "room", "read", "ring"],
      intermediate: ["restaurant", "remember", "priority", "progress", "direct", "library", "direction"],
      advanced: ["representative", "recursive", "reconstruct", "respiratory", "characteristic"]
    },
    "L Sounds": {
      beginner: ["look", "little", "like", "live", "late", "long", "love", "line", "left", "light"],
      intermediate: ["yellow", "popular", "clean", "place", "sleep", "building", "visual", "double"],
      advanced: ["literally", "legislative", "collection", "correlation", "technological"]
    },
    "V/W Sounds": {
      beginner: ["very", "voice", "view", "want", "walk", "wait", "work", "week"],
      intermediate: ["volcano", "value", "heavy", "evaluate", "whatever", "window", "everywhere"],
      advanced: ["vulnerability", "visualization", "wave-particle", "withdrawal", "unequivocally"]
    },
    "Final Consonants": {
      beginner: ["stop", "help", "desk", "hand", "cat", "dog", "cup", "map"],
      intermediate: ["project", "perfect", "product", "dynamic", "context", "respect", "development"],
      advanced: ["assessment", "requirement", "significance", "establishment"]
    },
    "Vowel Sounds": {
      beginner: ["home", "time", "food", "apple", "bed", "sit", "hot"],
      intermediate: ["beautiful", "vegetable", "computer", "customer", "manager", "important"],
      advanced: ["responsibility", "artificial intelligence", "communication", "specification"]
    }
  },

  // First day word list (Initial Baseline Assessment)
  FIRST_DAY_WORDS: [
    "water", "friend", "family", "school", "world", 
    "breakfast", "important", "beautiful", "vegetable", "computer"
  ],

  // Maps category label to baseline description
  CATEGORY_FOCUS_DESCRIPTIONS: {
    "TH Sounds": "Improve the 'TH' tongue-between-teeth fricative voicing.",
    "R Sounds": "Calibrate liquid R retraction and lip shape.",
    "L Sounds": "Practice clean light L contact and dark L back-tongue lifts.",
    "V/W Sounds": "Distinguish lip rounding (W) from lip-to-teeth contact (V).",
    "Final Consonants": "Reinforce clear final consonant releases, avoiding deletion.",
    "Vowel Sounds": "Calibrate American vowel tension and positioning."
  },

  // Resolves category of a word
  getWordCategory(word) {
    for (const category of Object.keys(this.WORDS_BY_CATEGORY)) {
      const diffs = this.WORDS_BY_CATEGORY[category];
      if (
        diffs.beginner.includes(word) ||
        diffs.intermediate.includes(word) ||
        diffs.advanced.includes(word)
      ) {
        return category;
      }
    }
    // Baseline items fallback
    if (["water", "breakfast", "computer", "beautiful", "vegetable", "important"].includes(word)) return "Vowel Sounds";
    if (["world", "friend"].includes(word)) return "Final Consonants";
    if (["family", "school"].includes(word)) return "Vowel Sounds";
    return "Vowel Sounds";
  },

  // Resolves difficulty of a word
  getWordDifficulty(word) {
    for (const category of Object.keys(this.WORDS_BY_CATEGORY)) {
      const diffs = this.WORDS_BY_CATEGORY[category];
      if (diffs.beginner.includes(word)) return "beginner";
      if (diffs.intermediate.includes(word)) return "intermediate";
      if (diffs.advanced.includes(word)) return "advanced";
    }
    // Baseline items fallback
    if (["water", "friend", "family", "school"].includes(word)) return "beginner";
    if (["world", "breakfast", "beautiful", "computer"].includes(word)) return "intermediate";
    return "advanced";
  },

  // Main generator function
  generateDailyWords(history, settings) {
    const level = settings.difficulty === 'adaptive' || !settings.difficulty ? this.computeAdaptiveDifficulty(history) : settings.difficulty;
    const progress = this.getCategoryProgress(history, level);
    const weakest = progress.slice().sort((a, b) => a.progress - b.progress || a.average - b.average)[0];
    const targetPool = this.WORDS_BY_CATEGORY[weakest.category][level] || this.WORDS_BY_CATEGORY[weakest.category].beginner;
    const practiced = new Set(history.map(item => item.word));
    const weakAttempts = history.filter(item => item.category === weakest.category).sort((a, b) => a.score - b.score).map(item => item.word);
    const ordered = [...new Set([...weakAttempts, ...targetPool.filter(word => !practiced.has(word)), ...targetPool])];
    const words = ordered.slice(0, 8).map(word => ({ word, ipa: this.IPA_DICTIONARY[word] || '', category: this.getWordCategory(word), difficulty: level }));
    return {
      focus: weakest.mastered ? `Maintain ${weakest.category}; the next weakest sound is now the priority.` : `Stay with ${weakest.category} until it is mastered: 5 attempts, latest 3 at 85%+, overall average 80%+.`,
      difficulty: level,
      weakestCategory: weakest.category,
      mastery: weakest,
      words
    };
  },

  getCategoryProgress(history, level) {
    return Object.keys(this.WORDS_BY_CATEGORY).map(category => {
      const attempts = history.filter(item => item.category === category && item.difficulty === level);
      const recent = attempts.slice(-3);
      const average = attempts.length ? Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length) : 0;
      const mastered = attempts.length >= 5 && recent.length === 3 && recent.every(item => item.score >= 85) && average >= 80;
      return { category, attempts: attempts.length, average, mastered, progress: Math.min(100, Math.round((Math.min(5, attempts.length) / 5) * 55 + (recent.filter(item => item.score >= 85).length / 3) * 45)) };
    });
  },

  computeAdaptiveDifficulty(history) {
    const beginner = this.getCategoryProgress(history, 'beginner');
    if (!beginner.every(item => item.mastered)) return 'beginner';
    const intermediate = this.getCategoryProgress(history, 'intermediate');
    if (!intermediate.every(item => item.mastered)) return 'intermediate';
    return 'advanced';
  }
};
