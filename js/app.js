const App = {
  state: { plan: null, index: 0, results: [], diagnostic: false, recording: false, preparing: false, sessionToken: 0, pending: null }, el: {},
  init() {
    this.el = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), node]));
    document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => this.showPage(button.dataset.page)));
    this.el.settingsOpen.addEventListener('click', () => this.openSettings()); this.el.saveSettings.addEventListener('click', () => this.saveSettings());
    this.el.resetData.addEventListener('click', () => { if (confirm('Delete all SpeakUp learning data stored in this browser?')) { StorageManager.reset(); location.reload(); } });
    this.el.startDiagnostic.addEventListener('click', () => this.startDiagnostic()); this.el.startPlan.addEventListener('click', () => this.startPlan()); this.el.exitSession.addEventListener('click', () => this.exitSession());
    this.el.listenTarget.addEventListener('click', () => this.listen()); this.el.playContrast.addEventListener('click', () => this.playContrast()); this.el.choiceA.addEventListener('click', () => this.answerPerception(0)); this.el.choiceB.addEventListener('click', () => this.answerPerception(1));
    this.el.recordButton.addEventListener('click', () => this.toggleRecording()); this.el.retryAttempt.addEventListener('click', () => this.retry()); this.el.nextAttempt.addEventListener('click', () => this.advance());
    this.refresh(); void StorageManager.syncIfEnabled().then(() => this.refresh()).catch(() => {});
  },
  showPage(page) { document.querySelectorAll('.coach-page').forEach(node => node.classList.toggle('active', node.id === `page-${page}`)); document.querySelectorAll('[data-page]').forEach(node => node.classList.toggle('active', node.dataset.page === page)); if (page !== 'today') this.refresh(); },
  refresh() {
    const profile = StorageManager.getProfile(), dashboard = StorageManager.dashboard(); this.el.onboarding.classList.toggle('hidden', profile.onboardingComplete); this.el.todayDashboard.classList.toggle('hidden', !profile.onboardingComplete); if (!profile.onboardingComplete) return;
    this.state.plan = Curriculum.todayPlan(dashboard.history, profile); this.el.todayMinutes.textContent = this.state.plan.minutes; this.el.planTitle.textContent = this.state.plan.title; this.el.planFocus.textContent = this.state.plan.focus; this.el.dueCount.textContent = dashboard.due; this.el.weekScore.textContent = dashboard.avg ? `${dashboard.avg}%` : '—'; this.el.levelStatus.textContent = `${dashboard.level.ready}/${dashboard.level.total}`; this.el.weakSkill.textContent = dashboard.weak ? dashboard.weak.skill.name : 'Complete your diagnostic.'; this.el.weakCopy.textContent = dashboard.weak ? dashboard.weak.skill.cue : '';
    this.el.planList.innerHTML = this.state.plan.items.map(item => `<li><span>${item.stage}</span><strong>${this.escape(item.target)}</strong><small>${this.escape(item.kind === 'listening' ? 'Hear the contrast' : item.format === 'Word' ? item.category : item.sentence)}</small></li>`).join(''); this.renderSkillMap(dashboard); this.renderReview(dashboard);
  },
  startDiagnostic() { const profile = StorageManager.getProfile(); profile.careerGoal = this.el.goalInput.value.trim() || profile.careerGoal; profile.dailyMinutes = Number(this.el.minutesInput.value); profile.firstLanguage = this.el.firstLanguageInput.value; StorageManager.saveProfile(profile); this.state.plan = { items: Curriculum.diagnosticPlan(profile), title: 'Speech map diagnostic' }; this.state.diagnostic = true; this.startSession(); },
  async startPlan() {
    if (this.el.startPlan.disabled) return;
    this.el.startPlan.disabled = true;
    const originalLabel = this.el.startPlan.innerHTML;
    this.el.startPlan.textContent = 'Preparing your practice…';
    try {
      this.state.diagnostic = false;
      const history = StorageManager.getHistory(), profile = StorageManager.getProfile();
      this.state.plan = Curriculum.todayPlan(history, profile);
      await this.addAdaptivePractice(history, profile);
      this.startSession();
    } finally { this.el.startPlan.disabled = false; this.el.startPlan.innerHTML = originalLabel; }
  },
  async addAdaptivePractice(history, profile) {
    const settings = StorageManager.getSettings(), base = StorageManager.apiBaseUrl();
    if (!settings.cloudCoach || !base) return;
    const skill = this.state.plan.primary.skill;
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const key = `${day}:${skill.id}`;
    const cached = StorageManager.read(StorageManager.KEYS.adaptive, {});
    let items = cached.key === key ? cached.items : null;
    if (!Array.isArray(items) || items.length !== 2) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
      try {
        const recent = history.filter(item => item.skillId === skill.id).slice(-6).map(item => ({ target: item.target, score: item.score, toImprove: item.toImprove, recordingQuality: item.evidence?.recordingQuality }));
        const response = await fetch(`${base}/api/practice-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ skillId: skill.id, skillName: skill.name, cue: skill.cue, firstLanguage: profile.firstLanguage, recent }) });
        if (!response.ok) throw new Error(`Adaptive plan request failed (${response.status})`);
        items = (await response.json()).items;
        if (!Array.isArray(items) || items.length !== 2) throw new Error('Invalid adaptive plan');
        localStorage.setItem(StorageManager.KEYS.adaptive, JSON.stringify({ key, items }));
      } catch (error) { console.warn('Using curated practice plan:', error); return; }
      finally { clearTimeout(timer); }
    }
    let wordUsed = false, sentenceUsed = false;
    this.state.plan.items = this.state.plan.items.map(item => {
      if (item.skillId !== skill.id || item.stage === 'Review' || item.kind === 'listening') return item;
      if (item.format === 'Word' && !wordUsed) { wordUsed = true; return { ...item, ...items[0], spokenTarget: items[0].target, adaptive: true }; }
      if (item.format === 'Sentence' && !sentenceUsed) { sentenceUsed = true; return { ...item, ...items[1], spokenTarget: items[1].sentence, adaptive: true }; }
      return item;
    });
  },
  startSession() { this.state.sessionToken++; this.state.index = 0; this.state.results = []; this.el.todayDashboard.classList.add('hidden'); this.el.onboarding.classList.add('hidden'); this.el.practiceStage.classList.remove('hidden'); this.renderPrompt(); },
  current() { return this.state.plan && this.state.plan.items[this.state.index]; },
  renderPrompt() {
    const item = this.current(); if (!item) return; const listening = item.kind === 'listening';
    this.el.sessionProgress.textContent = `${this.state.index + 1} / ${this.state.plan.items.length}`; this.el.sessionLineFill.style.width = `${((this.state.index + 1) / this.state.plan.items.length) * 100}%`; this.el.promptStage.textContent = item.stage; this.el.promptCategory.textContent = item.category || 'Speech map'; this.el.promptFormat.textContent = listening ? 'HEAR THE CONTRAST' : item.format === 'Word' ? 'SHAPE + SAY THIS WORD' : 'USE THIS AT WORK'; this.el.promptTarget.textContent = listening ? 'Listen, then choose' : item.format === 'Word' ? item.target : item.sentence; this.el.promptIpa.textContent = listening ? `${item.options[0]}  /  ${item.options[1]}` : item.format === 'Word' ? item.ipa : item.target; this.el.promptSentence.textContent = listening ? 'Play the audio as often as needed. Train your ear before you train your mouth.' : item.format === 'Word' ? item.sentence : item.cue || 'Speak naturally. Focus on clarity over speed.';
    this.el.listenTarget.classList.toggle('hidden', listening); this.el.perceptionPanel.classList.toggle('hidden', !listening); this.el.cameraCard.classList.toggle('hidden', listening); this.el.recordButton.classList.toggle('hidden', listening); this.el.choiceA.textContent = `A · ${item.options ? item.options[0] : ''}`; this.el.choiceB.textContent = `B · ${item.options ? item.options[1] : ''}`; this.el.movementTitle.textContent = listening ? 'Listening comes first' : 'Visible movement only'; this.el.movementCopy.textContent = listening ? 'Good pronunciation starts with hearing a contrast clearly.' : item.visualCue || 'The camera only assesses visible mouth shape.'; this.el.movementVideo.href = item.videoUrl || 'https://www.youtube.com/results?search_query=English+pronunciation+mouth+movement';
    this.el.feedbackSheet.classList.add('hidden'); this.el.recordLabel.textContent = 'Tap to speak'; this.el.recordStatus.textContent = 'We will listen for one attempt.'; this.el.cameraPlaceholder.classList.remove('hidden'); this.el.webcamFeed.style.display = 'none'; this.el.mouthHintBanner.textContent = 'Camera is optional. Visible-mouth analysis runs on this device.';
  },
  listen() { const item = this.current(); VoiceCoach.speak(item.spokenTarget); }, playContrast() { const item = this.current(); VoiceCoach.speak(item.listenWord, () => { this.el.promptSentence.textContent = 'Choose the word you heard. There is no penalty for replaying.'; }); },
  answerPerception(index) { const item = this.current(), chosen = item.options[index], correct = chosen === item.answer; this.state.pending = { ...item, score: correct ? 96 : 42, transcription: `You chose “${chosen}”.`, wellDone: correct ? 'You heard the contrast correctly.' : 'You completed a listening check.', toImprove: correct ? 'Now say the target once and keep this contrast in mind.' : `Replay it, then listen for the difference between “${item.options[0]}” and “${item.options[1]}”.`, cvMetrics: { opening: 'Not assessed', rounding: 'Not assessed' }, evidence: { transcriptConfidence: 'listening check', visualConfidence: 'not assessed', analysisSource: 'On-device contrast check', masteryResult: correct ? 'listening correct' : 'review listening' } }; this.showFeedback(this.state.pending); },
  async toggleRecording() {
    if (this.state.preparing) return;
    if (this.state.recording) { this.state.recording = false; VoiceCoach.stopPractice(); return; }
    const item = this.current(), token = this.state.sessionToken;
    this.state.preparing = true;
    this.el.recordButton.disabled = true;
    this.el.recordLabel.textContent = 'Framing check';
    this.el.recordStatus.textContent = 'Hold your face in view for 2–3 seconds. Camera is optional.';
    let calibration = { quality: 'not assessed', message: 'Camera unavailable. Audio practice continues.' };
    try {
      if (await MouthTracker.startCamera(this.el.webcamFeed, this.el.faceMeshOverlay, item.skillId)) {
        this.el.cameraPlaceholder.classList.add('hidden');
        calibration = await MouthTracker.calibrate();
      }
      if (token !== this.state.sessionToken) { MouthTracker.stopCamera(); return; }
      this.el.mouthHintBanner.textContent = calibration.message;
      this.state.recording = true;
      this.el.recordLabel.textContent = 'Tap to finish';
      this.el.recordStatus.textContent = 'Listening… speak naturally.';
      await VoiceCoach.startPractice(item.spokenTarget, item.ipa, item.category, item.stage, StorageManager.getProfile().firstLanguage || 'Other',
        status => { if (token === this.state.sessionToken) this.onStatus(status); },
        report => { if (token === this.state.sessionToken) this.completeAttempt(report); },
        error => { if (token === this.state.sessionToken) this.failAttempt(error); });
    } catch (error) { this.failAttempt('Could not start recording. Check microphone permission and retry.'); }
    finally { this.state.preparing = false; this.el.recordButton.disabled = false; }
  },
  onStatus(status) { if (status === 'analyzing') { this.el.recordLabel.textContent = 'Analysing'; this.el.recordStatus.textContent = 'Creating one clear next action…'; this.el.mouthHintBanner.textContent = 'Checking audio, delivery, and selected visual evidence.'; } },
  failAttempt(error) { this.state.recording = false; MouthTracker.stopCamera(); this.el.recordLabel.textContent = 'Try again'; this.el.recordStatus.textContent = error || 'Microphone unavailable.'; },
  completeAttempt(report) { this.state.recording = false; const item = this.current(), visual = MouthTracker.getLatestMetrics(); MouthTracker.stopCamera(); const evidence = { ...(report.evidence || {}), visualConfidence: visual.confidence || 'not assessed', analysisSource: report.evidence?.analysisSource || 'Browser fallback' }; const masteryEligible = evidence.recordingQuality === 'good' && evidence.transcriptConfidence === 'high' && String(evidence.analysisSource).startsWith('OpenAI'); evidence.masteryResult = masteryEligible && Number(report.score || 0) >= 82 ? 'clear intelligibility' : 'practice only'; const result = { ...item, score: Number(report.score || 0), transcription: report.transcription || '[Not captured]', wellDone: (report.wellDone || ['You completed the attempt.'])[0], toImprove: (report.toImprove || ['Repeat once, focusing on clarity.'])[0], cvMetrics: report.cvMetrics || visual, evidence, masteryEligible }; this.state.pending = result; this.showFeedback(result); },
  showFeedback(result) { const metrics = result.cvMetrics || {}, audio = result.evidence?.audioEvidence, coverage = audio ? ` Recogniser coverage: ${audio.matchedWords}/${audio.expectedWords} target words; ${Math.round((audio.coverage || 0) * 100)}%.` : ''; this.el.feedbackScore.textContent = result.evidence?.recordingQuality === 'retry' ? '—' : result.score; this.el.feedbackTranscript.textContent = result.transcription; this.el.feedbackGood.textContent = result.wellDone; this.el.feedbackNext.textContent = result.toImprove; this.el.feedbackConfidence.textContent = `Recording: ${result.evidence?.recordingQuality || 'not assessed'} · transcript: ${result.evidence?.transcriptConfidence || 'unknown'}`; this.el.feedbackEvidence.textContent = `${result.evidence?.analysisSource || 'Local evidence'}. ${result.evidence?.cloudStatus || ''} ${result.evidence?.recordingReason || ''} Visible mouth: ${result.evidence?.visualConfidence || 'not assessed'}. Opening: ${metrics.opening || 'not assessed'}; rounding: ${metrics.rounding || 'not assessed'}.${coverage} ${result.masteryEligible ? 'Eligible for mastery tracking.' : 'Not counted toward pronunciation mastery.'} This is a coaching signal, not a phoneme measurement.`; this.el.feedbackSheet.classList.remove('hidden'); },
  retry() { this.el.feedbackSheet.classList.add('hidden'); this.renderPrompt(); },
  advance() { if (this.state.pending) this.state.results.push(this.state.pending); this.state.pending = null; this.state.index++; if (this.state.index < this.state.plan.items.length) this.renderPrompt(); else this.finishSession(); },
  finishSession() { StorageManager.saveAttempts(this.state.results); if (this.state.diagnostic) { const profile = StorageManager.getProfile(); profile.onboardingComplete = true; StorageManager.saveProfile(profile); } this.el.practiceStage.classList.add('hidden'); this.el.feedbackSheet.classList.add('hidden'); this.el.todayDashboard.classList.remove('hidden'); this.state.diagnostic = false; this.refresh(); void StorageManager.syncIfEnabled().catch(() => {}); },
  exitSession() { this.state.sessionToken++; if (this.state.recording) VoiceCoach.cancelPractice(); this.state.recording = false; MouthTracker.stopCamera(); this.el.practiceStage.classList.add('hidden'); this.el.feedbackSheet.classList.add('hidden'); this.refresh(); },
  renderSkillMap(dashboard) { const show = value => value === null ? '—' : `${value}%`; this.el.skillMap.innerHTML = dashboard.skillProgress.map(entry => `<article class="skill-card"><div><span class="eyebrow">${this.escape(entry.skill.category)}</span><h2>${this.escape(entry.skill.name)}</h2></div><strong class="skill-status">${entry.ready ? 'READY TO BROADEN' : 'PRACTISING'}</strong><div class="progress-track"><i style="width:${entry.confidence}%"></i></div><div class="skill-scores"><span>Listening <b>${show(entry.scores.listening)}</b></span><span>Word <b>${show(entry.scores.word)}</b></span><span>Sentence <b>${show(entry.scores.sentence)}</b></span><span>Delayed review <b>${show(entry.scores.retention)}</b></span></div><p>${this.escape(entry.skill.cue)}</p><small>${entry.heard} heard · ${entry.clear} clear words · ${entry.transfers} transfers · ${entry.days} days${entry.retained ? ' · retained' : ''}</small></article>`).join(''); },
  renderReview(dashboard) {
    this.el.reviewSummary.innerHTML = `<article><strong>${dashboard.avg ? `${dashboard.avg}%` : '—'}</strong><span>14-day coaching signal</span></article><article><strong>${dashboard.history.length}</strong><span>saved attempts</span></article><article><strong>${dashboard.level.ready}/${dashboard.level.total}</strong><span>skills ready to broaden</span></article>`;
    this.el.attemptHistory.innerHTML = dashboard.history.length ? dashboard.history.slice().reverse().map(item => {
      const evidence = item.evidence || {};
      return `<article class="attempt"><div><strong>${this.escape(item.target)}</strong><span>${this.escape(item.stage || item.format || 'Practice')} · ${new Date(item.timestamp).toLocaleDateString('en-NZ')}</span></div><b>${item.evidence?.recordingQuality === 'retry' ? '—' : Number(item.score || 0)}</b><p>${this.escape(item.toImprove || 'No focus captured.')}</p><small>${item.masteryEligible || item.format === 'Listening' ? 'Mastery evidence' : 'Practice only'} · ${this.escape(item.skillId || '')}</small><details><summary>Attempt details</summary><dl><div><dt>Heard</dt><dd>${this.escape(item.transcription || 'Not captured')}</dd></div><div><dt>Good</dt><dd>${this.escape(item.wellDone || 'Not captured')}</dd></div><div><dt>Recording</dt><dd>${this.escape(evidence.recordingQuality || 'not assessed')} · ${this.escape(evidence.recordingReason || '')}</dd></div><div><dt>Transcript</dt><dd>${this.escape(evidence.transcriptConfidence || 'unknown')} (recognition reliability, not phoneme accuracy)</dd></div><div><dt>Visual</dt><dd>${this.escape(evidence.visualConfidence || 'not assessed')}</dd></div><div><dt>Source</dt><dd>${this.escape(evidence.analysisSource || 'local')} ${this.escape(evidence.cloudStatus || '')}</dd></div></dl></details></article>`;
    }).join('') : '<p class="empty-state">Complete a diagnostic to see your evidence and trend.</p>';
  },
  openSettings() { const settings = StorageManager.getSettings(), identity = StorageManager.read(StorageManager.KEYS.cloud, { lastSyncedAt: 0 }); this.el.apiBaseUrl.value = settings.apiBaseUrl || window.SPEAKUP_CONFIG?.apiBaseUrl || ''; this.el.cloudCoach.checked = !!settings.cloudCoach; this.el.visualConsent.checked = !!settings.shareVisualEvidence; this.el.cloudSync.checked = !!settings.cloudSync; this.el.syncStatus.textContent = identity.lastSyncedAt ? `Last backed up ${new Date(identity.lastSyncedAt).toLocaleString('en-NZ')}. Only progress and feedback text are included.` : 'This optional backup contains progress and feedback text only—never audio, camera frames, or your OpenAI key. It is protected by a device-only recovery key stored in this browser.'; this.el.settingsDialog.showModal(); },
  async saveSettings() { const previous = StorageManager.getSettings(); StorageManager.saveSettings({ ...previous, apiBaseUrl: this.el.apiBaseUrl.value.trim().replace(/\/$/, ''), cloudCoach: this.el.cloudCoach.checked, shareVisualEvidence: this.el.visualConsent.checked, cloudSync: this.el.cloudSync.checked }); if (this.el.cloudSync.checked) { this.el.syncStatus.textContent = 'Backing up your local progress…'; try { await StorageManager.syncIfEnabled(); const identity = StorageManager.read(StorageManager.KEYS.cloud, { lastSyncedAt: 0 }); this.el.syncStatus.textContent = `Backup complete ${new Date(identity.lastSyncedAt).toLocaleString('en-NZ')}.`; } catch (error) { this.el.syncStatus.textContent = error.message; } } },
  escape(value) { const span = document.createElement('span'); span.textContent = value || ''; return span.innerHTML; }
};
window.addEventListener('DOMContentLoaded', () => App.init());
