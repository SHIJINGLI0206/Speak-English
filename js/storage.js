/**
 * Storage Manager for AuraSpeak
 * Handles local persistence of practice history, settings, and analytics.
 */
const StorageManager = {
  KEYS: {
    HISTORY: 'auraspeak_practice_history',
    SETTINGS: 'auraspeak_settings'
  },

  DEFAULT_SETTINGS: {
    difficulty: 'adaptive', // adaptive, beginner, intermediate, advanced
    geminiKey: '',
    accent: 'US',
    currentDay: 1
  },

  // Retrieve app settings
  getSettings() {
    const settingsRaw = localStorage.getItem(this.KEYS.SETTINGS);
    if (!settingsRaw) {
      this.saveSettings(this.DEFAULT_SETTINGS);
      return { ...this.DEFAULT_SETTINGS };
    }
    try {
      return { ...this.DEFAULT_SETTINGS, ...JSON.parse(settingsRaw) };
    } catch (e) {
      console.error("Error parsing settings", e);
      return { ...this.DEFAULT_SETTINGS };
    }
  },

  // Save app settings
  saveSettings(settings) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Save a completed practice session
  savePracticeSession(wordsPracticed) {
    const history = this.getPracticeHistory();
    const today = new Date().toISOString().split('T')[0];
    
    wordsPracticed.forEach(item => {
      history.push({
        date: today,
        word: item.word,
        ipa: item.ipa,
        category: item.category,
        difficulty: item.difficulty,
        score: item.score,
        transcription: item.transcription,
        wellDone: item.wellDone || [],
        toImprove: item.toImprove || [],
        cvMetrics: item.cvMetrics || { opening: 'Optimal', rounding: 'Good' },
        timestamp: Date.now()
      });
    });

    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));

    // Increment day settings
    const settings = this.getSettings();
    settings.currentDay = (settings.currentDay || 1) + 1;
    this.saveSettings(settings);
  },

  // Get raw history list
  getPracticeHistory() {
    const historyRaw = localStorage.getItem(this.KEYS.HISTORY);
    if (!historyRaw) return [];
    try {
      return JSON.parse(historyRaw);
    } catch (e) {
      console.error("Error parsing history", e);
      return [];
    }
  },

  // Aggregates history for the Monthly Review screen
  getMonthlySummary() {
    const history = this.getPracticeHistory();
    const days = new Set();
    let totalScore = 0;
    
    // Track word improvement: word -> list of scores in chronological order
    const wordHistory = {};

    // Group challenges
    const challengeCounts = {
      'TH sound': 0,
      'R/L distinction': 0,
      'Final consonants': 0,
      'Vowel accuracy': 0
    };

    let mouthOpeningIssues = 0;
    let lipRoundingIssues = 0;
    let mouthStabilityIssues = 0;
    let totalAttempts = history.length;

    history.forEach(entry => {
      days.add(entry.date);
      totalScore += entry.score;

      // Word tracking
      if (!wordHistory[entry.word]) {
        wordHistory[entry.word] = [];
      }
      wordHistory[entry.word].push(entry.score);

      // Challenge mapping based on constructive feedback keywords
      const improvementText = (entry.toImprove || []).join(' ').toLowerCase();
      if (improvementText.includes('th') || entry.word.toLowerCase().includes('th')) {
        if (entry.score < 80) challengeCounts['TH sound']++;
      }
      if (improvementText.includes('r') || improvementText.includes('l') || entry.category === 'R Sounds' || entry.category === 'L Sounds') {
        if (entry.score < 80) challengeCounts['R/L distinction']++;
      }
      if (improvementText.includes('final') || improvementText.includes('ending') || entry.category === 'Final Consonants') {
        if (entry.score < 80) challengeCounts['Final consonants']++;
      }
      if (improvementText.includes('vowel') || entry.category === 'Vowel Sounds') {
        if (entry.score < 80) challengeCounts['Vowel accuracy']++;
      }

      // CV metrics analysis
      if (entry.cvMetrics) {
        if (entry.cvMetrics.opening && entry.cvMetrics.opening.toLowerCase().includes('wide')) mouthOpeningIssues++;
        if (entry.cvMetrics.rounding && entry.cvMetrics.rounding.toLowerCase().includes('round')) lipRoundingIssues++;
        if (entry.cvMetrics.stability && entry.cvMetrics.stability.toLowerCase().includes('stable')) mouthStabilityIssues++;
      }
    });

    const averageScore = totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0;

    // Calculate most improved words
    const improvedWords = [];
    Object.keys(wordHistory).forEach(word => {
      const scores = wordHistory[word];
      if (scores.length >= 2) {
        const first = scores[0];
        const last = scores[scores.length - 1];
        const gain = last - first;
        if (gain > 0) {
          improvedWords.push({ word, first, last, gain });
        }
      }
    });
    
    // Sort improved words by gain descending
    improvedWords.sort((a, b) => b.gain - a.gain);

    // Calculate weekly trends (e.g. last 4 weeks or current 4 weeks)
    // We group by calendar weeks of the current year-month
    const weeklyData = this.getWeeklyTrendData(history);

    // Top challenges sorted
    const sortedChallenges = Object.keys(challengeCounts)
      .map(key => ({ name: key, count: challengeCounts[key] }))
      .sort((a, b) => b.count - a.count)
      .filter(item => item.count > 0);

    return {
      daysActive: days.size,
      totalWordsPracticed: Object.keys(wordHistory).length,
      averageScore,
      totalAttempts,
      improvedWords: improvedWords.slice(0, 5), // top 5
      challenges: sortedChallenges.slice(0, 3), // top 3
      weeklyTrend: weeklyData,
      mouthOpeningPct: totalAttempts > 0 ? Math.round(((totalAttempts - mouthOpeningIssues) / totalAttempts) * 100) : 100,
      lipRoundingPct: totalAttempts > 0 ? Math.round(((totalAttempts - lipRoundingIssues) / totalAttempts) * 100) : 100,
      mouthStabilityPct: totalAttempts > 0 ? Math.round(((totalAttempts - mouthStabilityIssues) / totalAttempts) * 100) : 100
    };
  },

  // Generates 4 weeks of trend scores
  getWeeklyTrendData(history) {
    const weeklySums = [0, 0, 0, 0];
    const weeklyCounts = [0, 0, 0, 0];
    
    if (history.length === 0) {
      // Mock starting trend for visual appeal on first load
      return [65, 72, 78, 84];
    }

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    history.forEach(entry => {
      const diffMs = now - entry.timestamp;
      const weekIndex = Math.floor(diffMs / oneWeekMs);
      
      // Map to index 0, 1, 2, 3 representing chronologically older to newer (Week 1 -> Week 4)
      if (weekIndex >= 0 && weekIndex < 4) {
        const trendIndex = 3 - weekIndex; // 0: 3 weeks ago, 3: this week
        weeklySums[trendIndex] += entry.score;
        weeklyCounts[trendIndex]++;
      }
    });

    const results = [];
    for (let i = 0; i < 4; i++) {
      if (weeklyCounts[i] > 0) {
        results.push(Math.round(weeklySums[i] / weeklyCounts[i]));
      } else {
        // Fallback or baseline
        results.push(i === 0 ? 60 : results[i - 1] || 70);
      }
    }
    return results;
  },

  // Clears storage to default
  resetData() {
    localStorage.removeItem(this.KEYS.HISTORY);
    const settings = this.getSettings();
    settings.currentDay = 1;
    this.saveSettings(settings);
  }
};
