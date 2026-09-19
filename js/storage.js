const StorageManager = {
  KEYS: { history: 'speakup_v2_history', profile: 'speakup_v2_profile', settings: 'speakup_v2_settings' },
  defaults: { profile: { onboardingComplete: false, dailyMinutes: 30, careerGoal: 'Senior AI engineering', region: 'New Zealand', deviceId: '' }, settings: { accent: 'NZ', apiBaseUrl: '', cloudCoach: false, shareVisualEvidence: false, cloudSync: false } },
  read(key, fallback) { try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; } catch { return { ...fallback }; } },
  getProfile() { const profile = this.read(this.KEYS.profile, this.defaults.profile); if (!profile.deviceId) { profile.deviceId = crypto.randomUUID(); this.saveProfile(profile); } return profile; },
  saveProfile(profile) { localStorage.setItem(this.KEYS.profile, JSON.stringify({ ...this.defaults.profile, ...profile })); },
  getSettings() { return this.read(this.KEYS.settings, this.defaults.settings); },
  saveSettings(settings) { localStorage.setItem(this.KEYS.settings, JSON.stringify({ ...this.defaults.settings, ...settings })); },
  getHistory() { try { return JSON.parse(localStorage.getItem(this.KEYS.history) || '[]'); } catch { return []; } },
  reviewDelay(score, format) { return score < 70 ? 1 : score < 82 ? 2 : format === 'Word' ? 3 : 7; },
  saveAttempts(attempts) { const history = this.getHistory(), now = Date.now(); attempts.forEach((attempt, index) => { const timestamp = now + index; history.push({ ...attempt, timestamp, date: new Date(timestamp).toISOString().slice(0, 10), nextReviewAt: timestamp + this.reviewDelay(attempt.score, attempt.format) * 86400000 }); }); localStorage.setItem(this.KEYS.history, JSON.stringify(history.slice(-800))); },
  dashboard() { const history = this.getHistory(), skillProgress = Curriculum.skills.map(skill => ({ skill, ...Curriculum.progress(history, skill.id) })), last14 = history.filter(item => item.timestamp > Date.now() - 14 * 86400000), avg = last14.length ? Math.round(last14.reduce((sum, item) => sum + item.score, 0) / last14.length) : 0, due = history.filter(item => item.nextReviewAt <= Date.now()).length, weak = skillProgress.slice().sort((a, b) => a.confidence - b.confidence)[0]; return { history, skillProgress, avg, due, weak, level: Curriculum.nextLevel(history), recent: history.slice(-18).reverse() }; },
  reset() { Object.values(this.KEYS).forEach(key => localStorage.removeItem(key)); }
};
