const App = {
  state: { plan: null, index: 0, results: [], diagnostic: false, recording: false },
  el: {},
  init() {
    this.el = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), node]));
    document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => this.showPage(button.dataset.page)));
    this.el.settingsOpen.addEventListener('click', () => this.openSettings());
    this.el.saveSettings.addEventListener('click', () => this.saveSettings());
    this.el.resetData.addEventListener('click', () => { if (confirm('Delete all SpeakUp learning data stored in this browser?')) { StorageManager.reset(); location.reload(); } });
    this.el.startDiagnostic.addEventListener('click', () => this.startDiagnostic());
    this.el.startPlan.addEventListener('click', () => this.startPlan());
    this.el.exitSession.addEventListener('click', () => this.exitSession());
    this.el.listenTarget.addEventListener('click', () => this.listen());
    this.el.recordButton.addEventListener('click', () => this.toggleRecording());
    this.el.retryAttempt.addEventListener('click', () => this.retry());
    this.el.nextAttempt.addEventListener('click', () => this.advance());
    this.refresh();
  },
  showPage(page) {
    document.querySelectorAll('.coach-page').forEach(node => node.classList.toggle('active', node.id === `page-${page}`));
    document.querySelectorAll('[data-page]').forEach(node => node.classList.toggle('active', node.dataset.page === page));
    if (page === 'skills' || page === 'review') this.refresh();
  },
  refresh() {
    const profile = StorageManager.getProfile(), dashboard = StorageManager.dashboard();
    this.el.onboarding.classList.toggle('hidden', profile.onboardingComplete);
    this.el.todayDashboard.classList.toggle('hidden', !profile.onboardingComplete);
    if (!profile.onboardingComplete) return;
    this.state.plan = Curriculum.todayPlan(dashboard.history, profile);
    this.el.todayMinutes.textContent = this.state.plan.minutes;
    this.el.planTitle.textContent = this.state.plan.title;
    this.el.planFocus.textContent = this.state.plan.focus;
    this.el.dueCount.textContent = dashboard.due;
    this.el.weekScore.textContent = dashboard.avg ? `${dashboard.avg}%` : '—';
    this.el.levelStatus.textContent = `${dashboard.level.ready}/${dashboard.level.total}`;
    this.el.weakSkill.textContent = dashboard.weak ? dashboard.weak.skill.name : 'Complete your diagnostic.';
    this.el.weakCopy.textContent = dashboard.weak ? dashboard.weak.skill.cue : '';
    this.el.planList.innerHTML = this.state.plan.items.map(item => `<li><span>${item.stage}</span><strong>${this.escape(item.target)}</strong><small>${this.escape(item.format === 'Word' ? item.category : item.sentence)}</small></li>`).join('');
    this.renderSkillMap(dashboard); this.renderReview(dashboard);
  },
  startDiagnostic() {
    const profile = StorageManager.getProfile();
    profile.careerGoal = this.el.goalInput.value.trim() || profile.careerGoal;
    profile.dailyMinutes = Number(this.el.minutesInput.value);
    StorageManager.saveProfile(profile);
    this.state.plan = { items: Curriculum.diagnosticPlan(), title: 'Speech map diagnostic' };
    this.state.diagnostic = true; this.startSession();
  },
  startPlan() { this.state.diagnostic = false; this.state.plan = Curriculum.todayPlan(StorageManager.getHistory(), StorageManager.getProfile()); this.startSession(); },
  startSession() {
    this.state.index = 0; this.state.results = [];
    this.el.todayDashboard.classList.add('hidden'); this.el.onboarding.classList.add('hidden'); this.el.practiceStage.classList.remove('hidden');
    this.renderPrompt();
  },
  renderPrompt() {
    const item = this.current(); if (!item) return;
    this.el.sessionProgress.textContent = `${this.state.index + 1} / ${this.state.plan.items.length}`;
    this.el.sessionLineFill.style.width = `${((this.state.index + 1) / this.state.plan.items.length) * 100}%`;
    this.el.promptStage.textContent = item.stage; this.el.promptCategory.textContent = item.category || 'Speech map';
    this.el.promptFormat.textContent = item.format === 'Word' ? 'SAY THIS WORD' : 'SAY THIS SENTENCE';
    this.el.promptTarget.textContent = item.format === 'Word' ? item.target : item.sentence;
    this.el.promptIpa.textContent = item.format === 'Word' ? item.ipa : item.target;
    this.el.promptSentence.textContent = item.format === 'Word' ? item.sentence : item.cue || 'Speak naturally. Focus on clarity over speed.';
    this.el.feedbackSheet.classList.add('hidden'); this.el.recordLabel.textContent = 'Tap to speak'; this.el.recordStatus.textContent = 'We will listen for one attempt.';
    this.el.cameraPlaceholder.classList.remove('hidden'); this.el.webcamFeed.style.display = 'none'; this.el.mouthHintBanner.textContent = 'Camera is optional. Visible-mouth analysis runs on this device.';
  },
  current() { return this.state.plan && this.state.plan.items[this.state.index]; },
  listen() { const item = this.current(); VoiceCoach.speak(item.spokenTarget); },
  toggleRecording() {
    if (this.state.recording) { this.state.recording = false; VoiceCoach.stopPractice(); return; }
    const item = this.current(); this.state.recording = true; this.el.recordLabel.textContent = 'Tap to finish'; this.el.recordStatus.textContent = 'Listening… speak naturally.';
    this.el.cameraPlaceholder.classList.add('hidden');
    MouthTracker.startCamera(this.el.webcamFeed, this.el.faceMeshOverlay, item.category).catch(() => this.el.cameraPlaceholder.classList.remove('hidden'));
    VoiceCoach.startPractice(item.spokenTarget, item.ipa, item.category, status => this.onStatus(status), report => this.completeAttempt(report), error => this.failAttempt(error));
  },
  onStatus(status) { if (status === 'analyzing') { this.el.recordLabel.textContent = 'Analysing'; this.el.recordStatus.textContent = 'Creating one clear next action…'; this.el.mouthHintBanner.textContent = 'Analysing your selected evidence.'; } },
  failAttempt(error) { this.state.recording = false; MouthTracker.stopCamera(); this.el.recordLabel.textContent = 'Try again'; this.el.recordStatus.textContent = error || 'Microphone unavailable.'; },
  completeAttempt(report) {
    this.state.recording = false; const item = this.current(); const visual = MouthTracker.getLatestMetrics(); MouthTracker.stopCamera();
    const result = { ...item, score: Number(report.score || 0), transcription: report.transcription || '[Not captured]', wellDone: (report.wellDone || ['You completed the attempt.'])[0], toImprove: (report.toImprove || ['Repeat once, focusing on clarity.'])[0], cvMetrics: report.cvMetrics || visual, evidence: { ...(report.evidence || {}), visualConfidence: visual.confidence || 'not assessed', analysisSource: report.evidence?.analysisSource || 'Browser fallback' } };
    this.state.pending = result; this.showFeedback(result);
  },
  showFeedback(result) {
    this.el.feedbackScore.textContent = result.score;
    this.el.feedbackTranscript.textContent = result.transcription;
    this.el.feedbackGood.textContent = result.wellDone;
    this.el.feedbackNext.textContent = result.toImprove;
    const confidence = result.evidence.transcriptConfidence === 'high' || result.evidence.transcriptConfidence === 'available' ? 'available' : 'limited';
    this.el.feedbackConfidence.textContent = `Evidence: ${confidence}`;
    this.el.feedbackEvidence.textContent = `${result.evidence.analysisSource}. Visible mouth: ${result.evidence.visualConfidence}. Opening: ${result.cvMetrics.opening || 'not assessed'}; rounding: ${result.cvMetrics.rounding || 'not assessed'}.`;
    this.el.feedbackSheet.classList.remove('hidden');
  },
  retry() { this.el.feedbackSheet.classList.add('hidden'); this.renderPrompt(); },
  advance() {
    this.state.results.push(this.state.pending); this.state.pending = null; this.state.index++;
    if (this.state.index < this.state.plan.items.length) this.renderPrompt(); else this.finishSession();
  },
  finishSession() {
    StorageManager.saveAttempts(this.state.results);
    if (this.state.diagnostic) { const profile = StorageManager.getProfile(); profile.onboardingComplete = true; StorageManager.saveProfile(profile); }
    this.el.practiceStage.classList.add('hidden'); this.el.feedbackSheet.classList.add('hidden'); this.el.todayDashboard.classList.remove('hidden'); this.state.diagnostic = false; this.refresh();
  },
  exitSession() { if (this.state.recording) VoiceCoach.stopPractice(); MouthTracker.stopCamera(); this.el.practiceStage.classList.add('hidden'); this.el.feedbackSheet.classList.add('hidden'); this.refresh(); },
  renderSkillMap(dashboard) {
    this.el.skillMap.innerHTML = dashboard.skillProgress.map(entry => `<article class="skill-card"><div><span class="eyebrow">${this.escape(entry.skill.category)}</span><h2>${this.escape(entry.skill.name)}</h2></div><strong class="skill-status">${entry.ready ? 'STABLE' : `${entry.confidence}%`}</strong><div class="progress-track"><i style="width:${entry.confidence}%"></i></div><p>${this.escape(entry.skill.cue)}</p><small>${entry.clear}/5 recent clear · ${entry.transfers} sentence transfer${entry.retained ? ' · retained' : ''}</small></article>`).join('');
  },
  renderReview(dashboard) {
    this.el.reviewSummary.innerHTML = `<article><strong>${dashboard.avg ? `${dashboard.avg}%` : '—'}</strong><span>14-day coaching signal</span></article><article><strong>${dashboard.history.length}</strong><span>saved attempts</span></article><article><strong>${dashboard.level.ready}/${dashboard.level.total}</strong><span>core skills stable</span></article>`;
    this.el.attemptHistory.innerHTML = dashboard.recent.length ? dashboard.recent.map(item => `<article class="attempt"><div><strong>${this.escape(item.target)}</strong><span>${this.escape(item.stage || item.format || 'Practice')} · ${new Date(item.timestamp).toLocaleDateString('en-NZ')}</span></div><b>${item.score}</b><p>${this.escape(item.toImprove || 'No focus captured.')}</p><small>Heard: ${this.escape(item.transcription || 'not captured')} · ${this.escape(item.evidence?.analysisSource || 'local')}</small></article>`).join('') : '<p class="empty-state">Complete a diagnostic to see your evidence and trend.</p>';
  },
  openSettings() { const settings = StorageManager.getSettings(); this.el.apiBaseUrl.value = settings.apiBaseUrl || window.SPEAKUP_CONFIG?.apiBaseUrl || ''; this.el.cloudCoach.checked = !!settings.cloudCoach; this.el.visualConsent.checked = !!settings.shareVisualEvidence; this.el.settingsDialog.showModal(); },
  saveSettings() { const previous = StorageManager.getSettings(); StorageManager.saveSettings({ ...previous, apiBaseUrl: this.el.apiBaseUrl.value.trim().replace(/\/$/, ''), cloudCoach: this.el.cloudCoach.checked, shareVisualEvidence: this.el.visualConsent.checked }); },
  escape(value) { const span = document.createElement('span'); span.textContent = value || ''; return span.innerHTML; }
};
window.addEventListener('DOMContentLoaded', () => App.init());
