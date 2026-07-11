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
    // 1. First Day Experience
    if (!history || history.length === 0) {
      return {
        focus: "Establish your general pronunciation benchmark. Practicing vowels, final consonants, and liquid R/L sounds.",
        difficulty: "beginner",
        words: this.FIRST_DAY_WORDS.map(word => ({
          word,
          ipa: this.IPA_DICTIONARY[word] || "",
          category: this.getWordCategory(word),
          difficulty: "beginner"
        }))
      };
    }

    // Determine current level
    let targetLevel = settings.difficulty || 'adaptive';
    if (targetLevel === 'adaptive') {
      targetLevel = this.computeAdaptiveDifficulty(history);
    }

    // 2. Analyze weak categories
    const categoryScores = {};
    const categoryCounts = {};
    
    // Seed
    Object.keys(this.WORDS_BY_CATEGORY).forEach(cat => {
      categoryScores[cat] = 0;
      categoryCounts[cat] = 0;
    });

    history.forEach(entry => {
      const cat = entry.category;
      if (categoryScores[cat] !== undefined) {
        categoryScores[cat] += entry.score;
        categoryCounts[cat]++;
      }
    });

    // Find weakest category
    let weakestCategory = "TH Sounds";
    let lowestAvg = 100;
    let hasData = false;

    Object.keys(categoryScores).forEach(cat => {
      if (categoryCounts[cat] > 0) {
        hasData = true;
        const avg = categoryScores[cat] / categoryCounts[cat];
        if (avg < lowestAvg) {
          lowestAvg = avg;
          weakestCategory = cat;
        }
      }
    });

    // If no data on categories yet, pick TH Sounds or randomly select
    if (!hasData) {
      weakestCategory = "TH Sounds";
    }

    // 3. Select 60% Targeted Improvement Words (usually 6 words out of 10)
    const targetCount = 10;
    const poolTargeted = this.WORDS_BY_CATEGORY[weakestCategory][targetLevel] || [];
    const practicedWordsSet = new Set(history.map(h => h.word));
    
    // Sort pool to pick unpracticed first
    let targetedSelection = poolTargeted
      .filter(w => !practicedWordsSet.has(w))
      .slice(0, 6);

    // If we run out of unpracticed targeted words, backfill from practiced ones (worst score first)
    if (targetedSelection.length < 6) {
      const practicedTargeted = history
        .filter(h => h.category === weakestCategory && h.difficulty === targetLevel)
        .sort((a, b) => a.score - b.score)
        .map(h => h.word);
      
      const uniquePracticedTargeted = [...new Set(practicedTargeted)];
      for (const w of uniquePracticedTargeted) {
        if (targetedSelection.length >= 6) break;
        if (!targetedSelection.includes(w)) {
          targetedSelection.push(w);
        }
      }
    }

    // 4. Select 20% Review Words (2 words, score < 80)
    const reviewPool = history
      .filter(h => h.score < 80)
      .sort((a, b) => a.score - b.score) // lowest score first
      .map(h => h.word);
    
    const uniqueReviewPool = [...new Set(reviewPool)];
    const reviewSelection = [];
    for (const w of uniqueReviewPool) {
      if (reviewSelection.length >= 2) break;
      if (!targetedSelection.includes(w)) {
        reviewSelection.push(w);
      }
    }

    // 5. Select 20% New Words (2 words, unpracticed, any category of current level)
    const allNewPool = [];
    Object.keys(this.WORDS_BY_CATEGORY).forEach(cat => {
      this.WORDS_BY_CATEGORY[cat][targetLevel].forEach(w => {
        if (!practicedWordsSet.has(w) && !targetedSelection.includes(w) && !reviewSelection.includes(w)) {
          allNewPool.push(w);
        }
      });
    });
    
    // Shuffle new pool slightly
    const shuffledNew = allNewPool.sort(() => 0.5 - Math.random());
    const newSelection = shuffledNew.slice(0, 2);

    // 6. Assembly & Backfill if we didn't hit 10 items
    let finalWords = [...targetedSelection, ...reviewSelection, ...newSelection];
    
    // Backfill logic
    if (finalWords.length < targetCount) {
      const allLevelPool = [];
      Object.keys(this.WORDS_BY_CATEGORY).forEach(cat => {
        this.WORDS_BY_CATEGORY[cat][targetLevel].forEach(w => {
          if (!finalWords.includes(w)) {
            allLevelPool.push(w);
          }
        });
      });

      const shuffledBackfill = allLevelPool.sort(() => 0.5 - Math.random());
      for (const w of shuffledBackfill) {
        if (finalWords.length >= targetCount) break;
        finalWords.push(w);
      }
    }

    // If still short (e.g. advanced pool depleted), fallback to intermediate or beginner
    if (finalWords.length < targetCount) {
      const fallbackList = Object.keys(this.IPA_DICTIONARY);
      for (const w of fallbackList) {
        if (finalWords.length >= targetCount) break;
        if (!finalWords.includes(w)) {
          finalWords.push(w);
        }
      }
    }

    // Map back to card structure
    const cards = finalWords.map(word => ({
      word,
      ipa: this.IPA_DICTIONARY[word] || "/ˈwɝːd/",
      category: this.getWordCategory(word),
      difficulty: this.getWordDifficulty(word)
    }));

    const focusText = `Today's focus: Improve ${weakestCategory} (${this.CATEGORY_FOCUS_DESCRIPTIONS[weakestCategory]}).`;

    return {
      focus: focusText,
      difficulty: targetLevel,
      words: cards
    };
  },

  // Computes adaptive level based on latest averages
  computeAdaptiveDifficulty(history) {
    if (history.length < 5) return 'beginner';
    
    // Get last 5 attempts
    const lastAttempts = history.slice(-5);
    const avgScore = lastAttempts.reduce((sum, item) => sum + item.score, 0) / lastAttempts.length;

    // Detect level of latest attempts
    const latestDiffs = lastAttempts.map(item => item.difficulty);
    const modeDiff = latestDiffs.sort((a,b) =>
          latestDiffs.filter(v => v===a).length - latestDiffs.filter(v => v===b).length
    ).pop();

    if (avgScore > 84) {
      if (modeDiff === 'beginner') return 'intermediate';
      if (modeDiff === 'intermediate') return 'advanced';
      return 'advanced';
    } else if (avgScore < 66) {
      if (modeDiff === 'advanced') return 'intermediate';
      if (modeDiff === 'intermediate') return 'beginner';
      return 'beginner';
    }
    
    return modeDiff || 'beginner';
  }
};
