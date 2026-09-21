const StorageManager = {
  KEYS: { history: 'speakup_v2_history', profile: 'speakup_v2_profile', settings: 'speakup_v2_settings', cloud: 'speakup_v2_cloud' },
  defaults: { profile: { onboardingComplete: false, dailyMinutes: 30, careerGoal: 'Senior AI engineering', region: 'New Zealand', firstLanguage: 'Mandarin', deviceId: '' }, settings: { accent: 'NZ', apiBaseUrl: '', cloudCoach: false, shareVisualEvidence: false, cloudSync: false } },
  read(key, fallback) { try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; } catch { return { ...fallback }; } },
  getProfile() { const profile = this.read(this.KEYS.profile, this.defaults.profile); if (!profile.deviceId) { profile.deviceId = crypto.randomUUID(); this.saveProfile(profile); } return profile; },
  saveProfile(profile) { localStorage.setItem(this.KEYS.profile, JSON.stringify({ ...this.defaults.profile, ...profile })); },
  getSettings() { return this.read(this.KEYS.settings, this.defaults.settings); },
  saveSettings(settings) { localStorage.setItem(this.KEYS.settings, JSON.stringify({ ...this.defaults.settings, ...settings })); },
  getHistory() { try { return JSON.parse(localStorage.getItem(this.KEYS.history) || '[]'); } catch { return []; } },
  getCloudIdentity() { const saved = this.read(this.KEYS.cloud, { syncKey: '', lastSyncedAt: 0 }); if (!saved.syncKey) { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); saved.syncKey = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); localStorage.setItem(this.KEYS.cloud, JSON.stringify(saved)); } return saved; },
  saveCloudIdentity(identity) { localStorage.setItem(this.KEYS.cloud, JSON.stringify(identity)); },
  apiBaseUrl() { const settings = this.getSettings(); return (settings.apiBaseUrl || window.SPEAKUP_CONFIG?.apiBaseUrl || '').replace(/\/$/, ''); },
  mergeHistory(local, remote) { const merged = new Map(); [...remote, ...local].forEach(item => { if (!item?.timestamp || !item?.target) return; const key = `${item.timestamp}:${item.target}:${item.score}`; merged.set(key, item); }); return [...merged.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-800); },
  async syncIfEnabled() {
    const settings = this.getSettings(), apiBaseUrl = this.apiBaseUrl();
    if (!settings.cloudSync || !apiBaseUrl) return { skipped: true };
    const profile = this.getProfile(), identity = this.getCloudIdentity();
    const requestHeaders = { 'Content-Type': 'application/json', 'X-SpeakUp-Device': profile.deviceId, 'X-SpeakUp-Sync-Key': identity.syncKey };
    const remote = await fetch(`${apiBaseUrl}/api/progress`, { headers: requestHeaders });
    if (!remote.ok && remote.status !== 404) throw new Error('Cloud backup is unavailable. Your local progress is still safe.');
    const remoteData = remote.ok ? await remote.json() : { exists: false };
    const history = remoteData.exists ? this.mergeHistory(this.getHistory(), remoteData.payload?.history || []) : this.getHistory();
    localStorage.setItem(this.KEYS.history, JSON.stringify(history));
    const response = await fetch(`${apiBaseUrl}/api/progress`, { method: 'PUT', headers: requestHeaders, body: JSON.stringify({ profile, history }) });
    if (!response.ok) throw new Error('Cloud backup could not be saved. Your local progress is still safe.');
    const saved = await response.json(); this.saveCloudIdentity({ ...identity, lastSyncedAt: saved.updatedAt || Date.now() });
    return { synced: true };
  },
  reviewDelay(score, format) { return score < 70 ? 1 : score < 82 ? 2 : format === 'Listening' ? 3 : format === 'Word' ? 3 : 7; },
  saveAttempts(attempts) { const history = this.getHistory(), now = Date.now(); attempts.forEach((attempt, index) => { const timestamp = now + index; history.push({ ...attempt, timestamp, date: new Date(timestamp).toISOString().slice(0, 10), nextReviewAt: timestamp + this.reviewDelay(attempt.score, attempt.format) * 86400000 }); }); localStorage.setItem(this.KEYS.history, JSON.stringify(history.slice(-800))); },
  dashboard() { const history = this.getHistory(), skillProgress = Curriculum.skills.map(skill => ({ skill, ...Curriculum.progress(history, skill.id) })), last14 = history.filter(item => item.timestamp > Date.now() - 14 * 86400000), avg = last14.length ? Math.round(last14.reduce((sum, item) => sum + item.score, 0) / last14.length) : 0, due = history.filter(item => item.nextReviewAt <= Date.now()).length, weak = skillProgress.slice().sort((a, b) => a.confidence - b.confidence)[0]; return { history, skillProgress, avg, due, weak, level: Curriculum.nextLevel(history), recent: history.slice(-18).reverse() }; },
  reset() { Object.values(this.KEYS).forEach(key => localStorage.removeItem(key)); }
};
