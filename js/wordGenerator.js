/* SpeakUp curriculum: NZ workplace intelligibility, not accent imitation. */
const Curriculum = {
  diagnosticItems: [
    ['v-w', 'very', '/ˈver.i/', 'Say: We verified the value.', 'Word'],
    ['th-voiced', 'this', '/ðɪs/', 'Say: This is the third version.', 'Word'],
    ['th-voiceless', 'think', '/θɪŋk/', 'Say: I think the path is clear.', 'Word'],
    ['r-l', 'really', '/ˈrɪə.li/', 'Say: We really need reliable logs.', 'Word'],
    ['final-stops', 'project', '/ˈprɒdʒekt/', 'Say: The project shipped last week.', 'Word'],
    ['vowels', 'work', '/wɜːk/', 'Say: The work is ready for review.', 'Word'],
    ['stress', 'responsibility', '/rɪˌspɒnsəˈbɪləti/', 'Say: I will take responsibility for the rollout.', 'Sentence'],
    ['rhythm', 'update', '/ʌpˈdeɪt/', 'Say: Here is a short update on the incident.', 'Sentence'],
    ['clarity', 'architecture', '/ˈɑːkɪtektʃə/', 'Say: I recommend a simpler architecture.', 'Sentence'],
    ['leadership', 'decision', '/dɪˈsɪʒən/', 'Say: I disagree, but I support the decision.', 'Sentence']
  ],
  skills: [
    { id: 'v-w', name: 'V / W contrast', category: 'Consonant contrast', cue: 'For /v/, touch lower lip to upper teeth; for /w/, round both lips.', items: [['very', '/ˈver.i/', 'We verified the value.'], ['work', '/wɜːk/', 'The work is ready for review.']] },
    { id: 'th-voiced', name: 'Voiced TH', category: 'Consonant contrast', cue: 'Let the tongue tip show lightly and keep your voice on for /ð/.', items: [['this', '/ðɪs/', 'This is the third version.'], ['those', '/ðəʊz/', 'Those changes look good.']] },
    { id: 'th-voiceless', name: 'Unvoiced TH', category: 'Consonant contrast', cue: 'Let air pass over a light tongue-tip contact for /θ/.', items: [['think', '/θɪŋk/', 'I think the path is clear.'], ['three', '/θriː/', 'We have three options.']] },
    { id: 'r-l', name: 'R / L clarity', category: 'Consonant contrast', cue: 'Keep /r/ rounded and avoid replacing it with a light /l/.', items: [['really', '/ˈrɪə.li/', 'We really need reliable logs.'], ['release', '/rɪˈliːs/', 'The release is ready.']] },
    { id: 'final-stops', name: 'Final consonants', category: 'Word endings', cue: 'Finish the final sound; do not swallow the end of the word.', items: [['project', '/ˈprɒdʒekt/', 'The project shipped last week.'], ['build', '/bɪld/', 'The build passed.']] },
    { id: 'vowels', name: 'Core vowels', category: 'Vowel clarity', cue: 'Hold the vowel clearly before moving to the final consonant.', items: [['work', '/wɜːk/', 'The work is ready for review.'], ['world', '/wɜːld/', 'The world is changing quickly.']] },
    { id: 'stress', name: 'Word stress', category: 'Prosody', cue: 'Make the stressed syllable longer and clearer, not louder only.', items: [['responsibility', '/rɪˌspɒnsəˈbɪləti/', 'I will take responsibility for the rollout.'], ['communication', '/kəˌmjuːnɪˈkeɪʃən/', 'Clear communication reduces risk.']] },
    { id: 'rhythm', name: 'Sentence rhythm', category: 'Prosody', cue: 'Stress the key information and shorten the small connecting words.', items: [['update', '/ʌpˈdeɪt/', 'Here is a short update on the incident.'], ['priority', '/praɪˈɒrəti/', 'Our priority is customer impact.']] },
    { id: 'clarity', name: 'Technical clarity', category: 'Career transfer', cue: 'Use one idea per sentence and pause before the key point.', items: [['architecture', '/ˈɑːkɪtektʃə/', 'I recommend a simpler architecture.'], ['trade-off', '/ˈtreɪd ɒf/', 'The trade-off is speed versus reliability.']] },
    { id: 'leadership', name: 'Leadership language', category: 'Career transfer', cue: 'Keep the message direct, calm, and constructive.', items: [['decision', '/dɪˈsɪʒən/', 'I disagree, but I support the decision.'], ['alignment', '/əˈlaɪnmənt/', 'Let us confirm alignment before we proceed.']] }
  ],
  skill(id) { return this.skills.find(skill => skill.id === id); },
  diagnosticPlan() { return this.diagnosticItems.map(([skillId, target, ipa, sentence, format]) => ({ id: `diagnostic-${skillId}-${target}`, skillId, target, ipa, sentence, spokenTarget: format === 'Sentence' ? sentence.replace(/^Say:\s*/, '') : target, format, stage: 'Diagnostic' })); },
  progress(history, skillId) {
    const attempts = history.filter(item => item.skillId === skillId).sort((a, b) => a.timestamp - b.timestamp);
    const recent = attempts.slice(-5), clear = recent.filter(item => item.score >= 82).length;
    const transfers = attempts.filter(item => item.format !== 'Word' && item.score >= 82).length;
    const days = new Set(attempts.filter(item => item.score >= 82).map(item => item.date)).size;
    const retained = attempts.some(item => item.format !== 'Word' && item.score >= 82 && Date.now() - item.timestamp > 6 * 86400000);
    return { attempts, recent, clear, transfers, days, retained, ready: clear >= 4 && transfers >= 1 && days >= 2 && retained, confidence: Math.min(100, clear * 14 + Math.min(transfers, 2) * 12 + Math.min(days, 3) * 10 + (retained ? 16 : 0)) };
  },
  createItem(skill, index, format = 'Word', stage = 'Precision') {
    const [target, ipa, sentence] = skill.items[index % skill.items.length];
    return { id: `${skill.id}-${format}-${target}`, skillId: skill.id, target, ipa, sentence, spokenTarget: format === 'Word' ? target : sentence, format, stage, cue: skill.cue, category: skill.category };
  },
  todayPlan(history, profile) {
    const due = history.filter(item => item.nextReviewAt && item.nextReviewAt <= Date.now()).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    const ranked = this.skills.map(skill => ({ skill, progress: this.progress(history, skill.id) })).sort((a, b) => a.progress.confidence - b.progress.confidence || a.progress.attempts.length - b.progress.attempts.length);
    const [primary, secondary] = ranked, items = [];
    due.slice(0, 2).forEach((attempt, index) => { const skill = this.skill(attempt.skillId) || primary.skill; items.push(this.createItem(skill, index, attempt.format === 'Word' ? 'Sentence' : attempt.format, 'Review')); });
    items.push(this.createItem(primary.skill, 0, 'Word', 'Precision'));
    items.push(this.createItem(primary.skill, 1, 'Sentence', 'Transfer'));
    items.push(this.createItem(secondary.skill, 0, 'Word', 'Precision'));
    items.push(this.createItem(this.skill('clarity'), 0, 'Sentence', 'Career lab'));
    return { items: items.slice(0, 6), title: `Build ${primary.skill.name}`, focus: `${primary.skill.cue} Your plan mixes review, precision, and career transfer.`, minutes: profile.dailyMinutes || 30, primary };
  },
  nextLevel(history) { const core = this.skills.filter(skill => !['clarity', 'leadership'].includes(skill.id)); const ready = core.filter(skill => this.progress(history, skill.id).ready).length; return { ready, total: core.length, unlocked: ready === core.length }; }
};
