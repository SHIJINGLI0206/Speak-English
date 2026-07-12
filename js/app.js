/**
 * Master Application Coordinator for SpeakUp
 * Manages view routing, flashcard practice flows, button states, 
 * audio/cam synchronization, Chart.js rendering, and user configuration.
 */

const App = {
  // Application State
  state: {
    currentTab: 'daily-practice-view',
    currentSessionWords: [],
    currentWordIndex: 0,
    sessionResults: [],
    isRecording: false,
    scoreTrendChart: null
  },

  // DOM Cache
  nodes: {},

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.initClock();
    
    // Load initial settings and set values in drawer
    this.loadSettings();

    // Populate initial state details on Practice Intro
    this.refreshIntroScreen();

    // Prepare Monthly Review stats
    this.refreshMonthlyReview();
  },

  cacheDOM() {
    this.nodes = {
      // Time bar
      statusTime: document.getElementById('status-time'), // may be null if removed

      // Page Views
      dailyPracticeView: document.getElementById('daily-practice-view'),
      monthlyReviewView: document.getElementById('monthly-review-view'),
      
      // Bottom Navigation Tabs
      tabPractice: document.getElementById('tab-practice'),
      tabReview: document.getElementById('tab-review'),

      // Settings Drawer
      settingsTrigger: document.getElementById('settings-trigger'),
      settingsDrawer: document.getElementById('settings-drawer'),
      closeSettingsBtn: document.getElementById('close-settings-btn'),
      difficultySelect: document.getElementById('difficulty-select'),
      geminiKeyInput: document.getElementById('gemini-key-input'),
      resetHistoryBtn: document.getElementById('reset-history-btn'),

      // Practice Intro Elements
      practiceIntro: document.getElementById('practice-intro'),
      practiceDayTitle: document.getElementById('practice-day-title'),
      todayFocusText: document.getElementById('today-focus-text'),
      todayCardCount: document.getElementById('today-card-count'),
      currentDifficultyBadge: document.getElementById('current-difficulty-badge'),
      todayGoalPct: document.getElementById('today-goal-pct'),
      startSessionBtn: document.getElementById('start-session-btn'),

      // Practice Flow Elements
      practiceFlow: document.getElementById('practice-flow'),
      practiceProgressFill: document.getElementById('practice-progress-fill'),
      practiceProgressText: document.getElementById('practice-progress-text'),
      
      // Active Flashcard
      cardCategory: document.getElementById('card-category'),
      cardDiff: document.getElementById('card-diff'),
      cardWord: document.getElementById('card-word'),
      cardIpa: document.getElementById('card-ipa'),
      listenWordBtn: document.getElementById('listen-word-btn'),
      
      // Camera / CV Elements
      webcamFeed: document.getElementById('webcam-feed'),
      faceMeshOverlay: document.getElementById('face-mesh-overlay'),
      cameraPlaceholder: document.getElementById('camera-placeholder'),
      mouthHintBanner: document.getElementById('mouth-hint-banner'),

      // Practice Recording Controls
      voiceWaveContainer: document.getElementById('voice-wave-container'),
      practiceActionBtn: document.getElementById('practice-action-btn'),
      practiceBtnText: document.getElementById('practice-btn-text'),

      // AI Report Elements
      aiReportOverlay: document.getElementById('ai-report-overlay'),
      closeReportBtn: document.getElementById('close-report-btn'),
      reportScore: document.getElementById('report-score'),
      scoreRingProgress: document.getElementById('score-ring-progress'),
      reportTargetWord: document.getElementById('report-target-word'),
      reportSpokenWord: document.getElementById('report-spoken-word'),
      feedbackGoodList: document.getElementById('feedback-good-list'),
      feedbackImproveList: document.getElementById('feedback-improve-list'),
      cvMetricOpening: document.getElementById('cv-metric-opening'),
      cvMetricRounding: document.getElementById('cv-metric-rounding'),
      feedbackCvTip: document.getElementById('feedback-cv-tip'),
      retryWordBtn: document.getElementById('retry-word-btn'),
      nextWordBtn: document.getElementById('next-word-btn'),

      // Practice Completed Splash Elements
      practiceCompleted: document.getElementById('practice-completed'),
      compWordsCount: document.getElementById('comp-words-count'),
      compAvgScore: document.getElementById('comp-avg-score'),
      finishPracticeBtn: document.getElementById('finish-practice-btn'),

      // Review Dashboard Statistics
      sumDaysActive: document.getElementById('sum-days-active'),
      sumWordsCount: document.getElementById('sum-words-count'),
      sumAvgScore: document.getElementById('sum-avg-score'),
      improvedWordsTbody: document.getElementById('improved-words-tbody'),
      summaryChallengesList: document.getElementById('summary-challenges-list'),
      summaryArticulationList: document.getElementById('summary-articulation-list')
    };
  },

  bindEvents() {
    // Navigation Tabs
    this.nodes.tabPractice.addEventListener('click', () => this.switchTab('daily-practice-view'));
    this.nodes.tabReview.addEventListener('click', () => this.switchTab('monthly-review-view'));

    // Settings Toggle
    this.nodes.settingsTrigger.addEventListener('click', () => this.toggleSettings(true));
    this.nodes.closeSettingsBtn.addEventListener('click', () => this.toggleSettings(false));
    
    // Save Settings on Input
    this.nodes.difficultySelect.addEventListener('change', () => this.saveCurrentSettings());
    this.nodes.geminiKeyInput.addEventListener('input', () => this.saveCurrentSettings());
    
    // Reset Data
    this.nodes.resetHistoryBtn.addEventListener('click', () => this.handleDataReset());

    // Practice Flow Start
    this.nodes.startSessionBtn.addEventListener('click', () => this.startDailyPracticeSession());

    // Pronunciation Guide Playback
    this.nodes.listenWordBtn.addEventListener('click', () => this.playWordSample());

    // Practice Voice Trigger (Record / Stop)
    this.nodes.practiceActionBtn.addEventListener('click', () => this.toggleRecordingState());

    // AI Report actions
    this.nodes.closeReportBtn.addEventListener('click', () => this.closeReportOverlay());
    this.nodes.retryWordBtn.addEventListener('click', () => this.retryCurrentWord());
    this.nodes.nextWordBtn.addEventListener('click', () => this.advancePracticeWord());

    // Practice completed back home
    this.nodes.finishPracticeBtn.addEventListener('click', () => this.returnToPracticeIntro());
  },

  // Setup status bar clock
  initClock() {
    if (!this.nodes.statusTime) return; // Status bar removed on mobile — skip
    const updateClock = () => {
      const now = new Date();
      let hours = now.getHours();
      let minutes = now.getMinutes();
      hours = hours < 10 ? '0' + hours : hours;
      minutes = minutes < 10 ? '0' + minutes : minutes;
      this.nodes.statusTime.textContent = `${hours}:${minutes}`;
    };
    updateClock();
    setInterval(updateClock, 1000);
  },

  // Switch tabs
  switchTab(tabId) {
    if (this.state.currentTab === tabId) return;

    // Remove active indicators
    this.nodes.tabPractice.classList.remove('active');
    this.nodes.tabReview.classList.remove('active');
    this.nodes.dailyPracticeView.classList.remove('active');
    this.nodes.monthlyReviewView.classList.remove('active');

    // Add active indicators
    if (tabId === 'daily-practice-view') {
      this.nodes.tabPractice.classList.add('active');
      this.nodes.dailyPracticeView.classList.add('active');
      this.refreshIntroScreen();
    } else {
      this.nodes.tabReview.classList.add('active');
      this.nodes.monthlyReviewView.classList.add('active');
      this.refreshMonthlyReview();
    }

    this.state.currentTab = tabId;
  },

  // Load storage settings to inputs
  loadSettings() {
    const settings = StorageManager.getSettings();
    this.nodes.difficultySelect.value = settings.difficulty || 'adaptive';
    this.nodes.geminiKeyInput.value = settings.geminiKey || '';
  },

  // Save inputs to storage
  saveCurrentSettings() {
    const settings = StorageManager.getSettings();
    settings.difficulty = this.nodes.difficultySelect.value;
    settings.geminiKey = this.nodes.geminiKeyInput.value;
    StorageManager.saveSettings(settings);
    this.refreshIntroScreen();
  },

  toggleSettings(show) {
    if (show) {
      this.nodes.settingsDrawer.classList.remove('hidden');
    } else {
      this.nodes.settingsDrawer.classList.add('hidden');
    }
  },

  handleDataReset() {
    if (confirm("Are you sure you want to clear your pronunciation history? This resets your daily coach back to Day 1.")) {
      StorageManager.resetData();
      this.loadSettings();
      this.refreshIntroScreen();
      this.refreshMonthlyReview();
      this.toggleSettings(false);
      alert("Practice history cleared successfully!");
    }
  },

  // Populates word lists and goals on welcome page
  refreshIntroScreen() {
    const history = StorageManager.getPracticeHistory();
    const settings = StorageManager.getSettings();

    // Set day title
    const day = settings.currentDay || 1;
    this.nodes.practiceDayTitle.textContent = `Day ${day}: Pronunciation Practice`;

    // Generate vocabulary to check word counts/categories
    const session = VocabularyDatabase.generateDailyWords(history, settings);
    
    this.nodes.todayFocusText.textContent = session.focus;
    this.nodes.todayCardCount.textContent = session.words.length;
    
    // Set level badge
    let levelTxt = "Beg";
    if (session.difficulty === 'intermediate') levelTxt = "Int";
    if (session.difficulty === 'advanced') levelTxt = "Adv";
    this.nodes.currentDifficultyBadge.textContent = levelTxt;

    // Set dynamic goal percentage
    let goalScore = 70;
    if (session.difficulty === 'intermediate') goalScore = 78;
    if (session.difficulty === 'advanced') goalScore = 84;
    this.nodes.todayGoalPct.textContent = `${goalScore}%`;
  },

  // Launches daily practice
  async startDailyPracticeSession() {
    const history = StorageManager.getPracticeHistory();
    const settings = StorageManager.getSettings();
    
    // Generate daily word set
    const session = VocabularyDatabase.generateDailyWords(history, settings);
    
    this.state.currentSessionWords = session.words;
    this.state.currentWordIndex = 0;
    this.state.sessionResults = [];

    // Switch views
    this.nodes.practiceIntro.classList.add('hidden');
    this.nodes.practiceFlow.classList.remove('hidden');
    
    this.loadActiveCard();
  },

  // Loads word info on active card view
  loadActiveCard() {
    const wordIndex = this.state.currentWordIndex;
    const cards = this.state.currentSessionWords;
    const wordData = cards[wordIndex];

    // Card text bindings
    this.nodes.cardWord.textContent = wordData.word;
    this.nodes.cardIpa.textContent = wordData.ipa;
    this.nodes.cardCategory.textContent = wordData.category;
    
    // Capitalize difficulty string
    const diffText = wordData.difficulty.charAt(0).toUpperCase() + wordData.difficulty.slice(1);
    this.nodes.cardDiff.textContent = diffText;

    // Update progress bar
    const ratio = wordIndex + 1;
    const total = cards.length;
    const pct = (ratio / total) * 100;
    
    this.nodes.practiceProgressFill.style.width = `${pct}%`;
    this.nodes.practiceProgressText.textContent = `${ratio} / ${total}`;

    // Reset controls/camera states
    this.nodes.voiceWaveContainer.classList.add('hidden');
    this.nodes.practiceActionBtn.classList.remove('recording');
    this.nodes.practiceBtnText.textContent = "Tap to Practice";
    this.nodes.cameraPlaceholder.classList.remove('hidden');
    this.nodes.webcamFeed.style.display = 'none';
    this.nodes.mouthHintBanner.textContent = "Align your mouth in the box and tap Practice";
    this.state.isRecording = false;

    // Stop active camera just in case
    MouthTracker.stopCamera();
  },

  // Play Native American IPA synthesis
  playWordSample() {
    const wordIndex = this.state.currentWordIndex;
    const word = this.state.currentSessionWords[wordIndex].word;
    
    this.nodes.listenWordBtn.style.opacity = '0.5';
    VoiceCoach.speak(word, () => {
      this.nodes.listenWordBtn.style.opacity = '1.0';
    });
  },

  // Toggle microphone and camera
  async toggleRecordingState() {
    const wordIndex = this.state.currentWordIndex;
    const cardData = this.state.currentSessionWords[wordIndex];

    if (!this.state.isRecording) {
      // Update UI immediately so the button feels responsive on iOS
      this.state.isRecording = true;
      this.nodes.practiceActionBtn.classList.add('recording');
      this.nodes.practiceBtnText.textContent = 'Tap to Finish';
      this.nodes.voiceWaveContainer.classList.remove('hidden');
      this.nodes.mouthHintBanner.textContent = '🔊 Speaking - Articulate Clearly';

      // 1. Start speech recognition first (critical path)
      //    VoiceCoach.startPractice is async but we don't await it here
      //    so the button state update above is already visible.
      VoiceCoach.startPractice(
        cardData.word,
        cardData.ipa,
        cardData.category,
        (status) => this.handlePracticeStatusUpdate(status),
        (report) => this.handlePracticeCompleted(report),
        (err) => {
          alert(err);
          this.state.isRecording = false;
          this.resetPracticeControls();
        }
      );

      // 2. Start camera as a secondary, non-blocking enhancement.
      //    We don't gate the recording flow on camera success.
      this.nodes.cameraPlaceholder.classList.add('hidden');
      MouthTracker.startCamera(this.nodes.webcamFeed, this.nodes.faceMeshOverlay)
        .then(camSuccess => {
          if (!camSuccess) {
            // Camera failed but speech is still running — silently show placeholder
            this.nodes.cameraPlaceholder.classList.remove('hidden');
          }
        });

    } else {
      // User tapped "Tap to Finish" — stop and analyse immediately
      this.state.isRecording = false;
      VoiceCoach.stopPractice();
    }
  },

  handlePracticeStatusUpdate(status) {
    if (status === "listening") {
      this.nodes.practiceBtnText.textContent = "Tap to Finish";
    } else if (status === "analyzing") {
      this.nodes.practiceBtnText.textContent = "Analyzing AI...";
      this.nodes.mouthHintBanner.textContent = "🤖 Processing Pronunciation Analytics";
    }
  },

  // Triggered when recording completes and feedback generates
  handlePracticeCompleted(report) {
    // Stop camera track
    MouthTracker.stopCamera();
    this.resetPracticeControls();

    // Cache result in current session
    const wordIndex = this.state.currentWordIndex;
    const cardData = this.state.currentSessionWords[wordIndex];

    this.state.sessionResults.push({
      ...cardData,
      score: report.score,
      transcription: report.transcription,
      wellDone: report.wellDone,
      toImprove: report.toImprove,
      cvMetrics: report.cvMetrics
    });

    // Populate Report Overlay sheet
    this.nodes.reportScore.textContent = report.score;
    this.nodes.reportTargetWord.textContent = cardData.word;
    this.nodes.reportSpokenWord.textContent = report.transcription;

    // Handle transcription accuracy color styling
    const cleanTarget = cardData.word.toLowerCase().replace(/[^a-z]/g, "");
    const cleanSpoken = report.transcription.toLowerCase().replace(/[^a-z]/g, "");
    if (cleanSpoken === cleanTarget) {
      this.nodes.reportSpokenWord.className = "comp-val word-spoken exact";
    } else {
      this.nodes.reportSpokenWord.className = "comp-val word-spoken";
    }

    // Radial Progress meter: perimeter = 251.2
    const perimeter = 251.2;
    const offset = perimeter - (perimeter * report.score) / 100;
    this.nodes.scoreRingProgress.style.strokeDashoffset = offset;

    // Color code ring based on score
    if (report.score >= 85) {
      this.nodes.scoreRingProgress.style.stroke = "var(--accent-green)";
    } else if (report.score >= 70) {
      this.nodes.scoreRingProgress.style.stroke = "var(--accent-purple)";
    } else {
      this.nodes.scoreRingProgress.style.stroke = "var(--accent-red)";
    }

    // Populate lists
    this.nodes.feedbackGoodList.innerHTML = report.wellDone.map(item => `<li>${item}</li>`).join('');
    this.nodes.feedbackImproveList.innerHTML = report.toImprove.map(item => `<li>${item}</li>`).join('');

    // CV reports
    this.nodes.cvMetricOpening.textContent = report.cvMetrics.opening;
    this.nodes.cvMetricRounding.textContent = report.cvMetrics.rounding;
    this.nodes.feedbackCvTip.textContent = `"${report.cvMetrics.tip}"`;

    // Slide report sheet up
    this.nodes.aiReportOverlay.classList.remove('hidden');
  },

  resetPracticeControls() {
    this.state.isRecording = false;
    this.nodes.practiceActionBtn.classList.remove('recording');
    this.nodes.practiceBtnText.textContent = "Tap to Practice";
    this.nodes.voiceWaveContainer.classList.add('hidden');
  },

  closeReportOverlay() {
    this.nodes.aiReportOverlay.classList.add('hidden');
  },

  retryCurrentWord() {
    this.closeReportOverlay();
    // Remove last session result
    this.state.sessionResults.pop();
    this.loadActiveCard();
  },

  advancePracticeWord() {
    this.closeReportOverlay();
    
    const wordIndex = this.state.currentWordIndex;
    const totalWords = this.state.currentSessionWords.length;

    if (wordIndex < totalWords - 1) {
      this.state.currentWordIndex++;
      this.loadActiveCard();
    } else {
      // Completed last card
      this.finishPracticeSession();
    }
  },

  finishPracticeSession() {
    this.nodes.practiceFlow.classList.add('hidden');
    this.nodes.practiceCompleted.classList.remove('hidden');

    // Aggregate average score
    const results = this.state.sessionResults;
    const avg = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);

    this.nodes.compWordsCount.textContent = `${results.length}/${this.state.currentSessionWords.length}`;
    this.nodes.compAvgScore.textContent = `${avg}%`;

    // Persist session to local storage
    StorageManager.savePracticeSession(results);
  },

  returnToPracticeIntro() {
    // Hide Completed Page and reset cards status
    this.nodes.practiceCompleted.classList.add('hidden');
    this.nodes.practiceIntro.classList.remove('hidden');
    this.refreshIntroScreen();
  },

  // --- Monthly Review View Logic ---
  refreshMonthlyReview() {
    const summary = StorageManager.getMonthlySummary();

    // Card items
    this.nodes.sumDaysActive.textContent = summary.daysActive;
    this.nodes.sumWordsCount.textContent = summary.totalAttempts; // Show total completed reviews
    this.nodes.sumAvgScore.textContent = `${summary.averageScore}%`;

    // Draw Improved Words Table
    if (summary.improvedWords.length > 0) {
      this.nodes.improvedWordsTbody.innerHTML = summary.improvedWords.map(item => `
        <tr>
          <td>${item.word}</td>
          <td class="score-low">${item.first}%</td>
          <td class="score-high">${item.last}%</td>
          <td class="score-gain">+${item.gain}%</td>
        </tr>
      `).join('');
    } else {
      this.nodes.improvedWordsTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); font-size: 11px;">
            Practice words multiple times to display improvement trends here.
          </td>
        </tr>
      `;
    }

    // Populate challenges lists
    if (summary.challenges.length > 0) {
      this.nodes.summaryChallengesList.innerHTML = summary.challenges.map((item, idx) => {
        let text = "";
        if (item.name === "TH sound") text = "Replacing voiceless /θ/ with /t/ or /f/.";
        if (item.name === "R/L distinction") text = "Tongue retraction issues during liquid vowels.";
        if (item.name === "Final consonants") text = "Devoicing or swallowing stop sounds like /d/, /t/.";
        if (item.name === "Vowel accuracy") text = "Slight acoustic shifts in flat/rounded vowel centers.";
        return `<li><strong>${item.name}</strong> (${text})</li>`;
      }).join('');
    } else {
      this.nodes.summaryChallengesList.innerHTML = `
        <li><strong>No challenges identified yet!</strong> Keep practicing to let the coach isolate weaknesses.</li>
      `;
    }

    // Articulation highlights based on CV scores
    this.nodes.summaryArticulationList.innerHTML = `
      <li>Mouth opening stability score: <strong>${summary.mouthOpeningPct}%</strong> of attempts match target grid metrics.</li>
      <li>Lip rounding tracking consistency: <strong>${summary.lipRoundingPct}%</strong> of vowel triggers are properly shaped.</li>
      <li>Stability of tongue placement: <strong>${summary.mouthStabilityPct}%</strong> match sound duration constraints.</li>
    `;

    // Render Weekly Score Chart
    this.drawChart(summary.weeklyTrend);
  },

  drawChart(trendData) {
    const canvas = document.getElementById('score-trend-chart');
    if (!canvas) return;

    // Destroy existing instance to prevent duplication crashes
    if (this.state.scoreTrendChart) {
      this.state.scoreTrendChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    
    // Accent colors config
    const purple = '#8b5cf6';
    const indigo = '#6366f1';

    // Chart.js configurations
    this.state.scoreTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{
          label: 'Average Score',
          data: trendData,
          borderColor: purple,
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          pointBackgroundColor: indigo,
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.35,
          borderWidth: 2.5,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#110d29',
            titleFont: { family: 'Outfit', size: 11, weight: '700' },
            bodyFont: { family: 'Inter', size: 12 },
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            padding: 8,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return `Score: ${context.raw}%`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#9ca3af',
              font: { family: 'Inter', size: 10 }
            }
          },
          y: {
            min: 40,
            max: 100,
            grid: {
              color: 'rgba(255, 255, 255, 0.04)'
            },
            ticks: {
              stepSize: 10,
              color: '#9ca3af',
              font: { family: 'Inter', size: 10 }
            }
          }
        }
      }
    });
  }
};

// Initialize app when DOM finishes loading
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
