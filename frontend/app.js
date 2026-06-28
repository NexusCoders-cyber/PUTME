const STORAGE_PROFILE = 'uiprep_profile';
const STORAGE_HISTORY = 'uiprep_history';

let mode = 'exam';
let allQuestions = {};
let currentSubjectIndex = 0;
let currentQuestionIndex = 0;
let subjects = [];
let answersBySubject = {};
let flagsBySubject = {};
let timerInterval = null;
let timeLeft = 5400;
let examSubmitted = false;
let reviewTab = 'wrong';
let gridSheetSubject = 0;
let aiEnabled = false;

function getProfile() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PROFILE) || 'null'); } catch { return null; }
}

function setProfile(p) {
  localStorage.setItem(STORAGE_PROFILE, JSON.stringify(p));
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); } catch { return []; }
}

function saveSession(session) {
  const hist = getHistory();
  hist.unshift(session);
  if (hist.length > 50) hist.splice(50);
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(hist));
}

function saveName() {
  const val = document.getElementById('home-name-input').value.trim();
  if (!val) { toast('Enter a valid name'); return; }
  setProfile({ name: val, createdAt: Date.now() });
  renderHomeUser();
  toast('Name saved!');
}

function showNameInput() {
  document.getElementById('welcome-card').classList.add('hidden');
  document.getElementById('new-user-card').classList.remove('hidden');
  const p = getProfile();
  if (p) document.getElementById('home-name-input').value = p.name;
}

function renderHomeUser() {
  const profile = getProfile();
  const history = getHistory();
  if (profile) {
    document.getElementById('welcome-card').classList.remove('hidden');
    document.getElementById('new-user-card').classList.add('hidden');
    document.getElementById('welcome-name').textContent = profile.name;
    document.getElementById('wstat-sessions').textContent = history.length;
    if (history.length > 0) {
      const avg = Math.round(history.reduce((s, h) => s + h.pct, 0) / history.length);
      const best = Math.max(...history.map(h => h.pct));
      document.getElementById('wstat-avg').textContent = avg + '%';
      document.getElementById('wstat-best').textContent = best + '%';
    } else {
      document.getElementById('wstat-avg').textContent = '—';
      document.getElementById('wstat-best').textContent = '—';
    }
  } else {
    document.getElementById('welcome-card').classList.add('hidden');
    document.getElementById('new-user-card').classList.remove('hidden');
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'home') renderHomeUser();
  if (id === 'history') renderHistory();
}

function openSetup(m) {
  mode = m;
  document.getElementById('setup-title').textContent = m === 'exam' ? 'Exam Mode' : 'Practice Mode';
  document.getElementById('setup-sub').textContent = m === 'exam' ? 'Configure your timed exam session' : 'Choose what to practise';
  document.getElementById('exam-info').style.display = m === 'exam' ? 'flex' : 'none';
  showScreen('setup');
}

function toggleSubject(el) {
  el.classList.toggle('selected');
}

function getSelectedSubjects() {
  return [...document.querySelectorAll('#subject-grid .subj-chip.selected')].map(el => el.dataset.subject);
}

async function startSession() {
  const selSubjects = getSelectedSubjects();
  if (selSubjects.length === 0) { toast('Select at least one subject'); return; }
  const year = document.getElementById('year-select').value;
  const countRaw = document.getElementById('count-select').value;
  const count = countRaw === 'all' ? 9999 : parseInt(countRaw);
  const btn = document.getElementById('start-btn');
  btn.textContent = 'Loading…';
  btn.disabled = true;
  try {
    const res = await fetch(`/api/questions?year=${year}&count=${count}`);
    const data = await res.json();
    allQuestions = {};
    subjects = [];
    selSubjects.forEach(subj => {
      if (data[subj] && data[subj].length > 0) {
        allQuestions[subj] = data[subj];
        subjects.push(subj);
      }
    });
    if (subjects.length === 0) { toast('No questions found'); return; }
    answersBySubject = {};
    flagsBySubject = {};
    subjects.forEach(s => { answersBySubject[s] = {}; flagsBySubject[s] = new Set(); });
    currentSubjectIndex = 0;
    currentQuestionIndex = 0;
    examSubmitted = false;
    if (mode === 'exam') {
      timeLeft = 5400;
      startTimer();
    }
    await checkAIStatus();
    renderQuiz();
    showScreen('quiz');
  } catch (e) {
    toast('Failed to load questions');
  } finally {
    btn.textContent = 'Start Session';
    btn.disabled = false;
  }
}

async function checkAIStatus() {
  try {
    const res = await fetch('/api/ai/status');
    const d = await res.json();
    aiEnabled = d.enabled;
  } catch { aiEnabled = false; }
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) { clearInterval(timerInterval); submitExam(); }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  const el = document.getElementById('timer-display');
  const timer = document.getElementById('quiz-timer');
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  timer.className = 'quiz-timer' + (timeLeft < 300 ? ' danger' : timeLeft < 900 ? ' warning' : '');
}

function renderQuiz() {
  const timerEl = document.getElementById('quiz-timer');
  timerEl.classList.toggle('hidden', mode !== 'exam');
  const submitBar = document.getElementById('submit-bar');
  submitBar.classList.add('hidden');

  buildSubjectTabs();
  renderQuestion();
}

function buildSubjectTabs() {
  const row = document.getElementById('subject-tabs-row');
  row.innerHTML = '';
  subjects.forEach((subj, i) => {
    const answered = Object.keys(answersBySubject[subj] || {}).length;
    const total = (allQuestions[subj] || []).length;
    const tab = document.createElement('button');
    tab.className = 'stab' + (i === currentSubjectIndex ? ' active' : '');
    tab.innerHTML = `${subj} <span class="stab-count">${answered}/${total}</span>`;
    tab.onclick = () => { currentSubjectIndex = i; currentQuestionIndex = 0; renderQuestion(); updateSubjectTabs(); };
    row.appendChild(tab);
  });
}

function updateSubjectTabs() {
  const tabs = document.querySelectorAll('.stab');
  tabs.forEach((tab, i) => {
    tab.className = 'stab' + (i === currentSubjectIndex ? ' active' : '');
    const subj = subjects[i];
    const answered = Object.keys(answersBySubject[subj] || {}).length;
    const total = (allQuestions[subj] || []).length;
    tab.innerHTML = `${subj} <span class="stab-count">${answered}/${total}</span>`;
  });
}

function renderQuestion() {
  const subj = subjects[currentSubjectIndex];
  const q = allQuestions[subj][currentQuestionIndex];
  const total = allQuestions[subj].length;

  document.getElementById('quiz-subject-name').textContent = subj;
  document.getElementById('quiz-progress-text').textContent = `Q ${currentQuestionIndex + 1} / ${total}`;
  document.getElementById('question-number').textContent = `Question ${currentQuestionIndex + 1}`;
  document.getElementById('question-text').textContent = q.q;
  document.getElementById('grid-btn-label').textContent = `${currentQuestionIndex + 1} / ${total}`;

  const selected = answersBySubject[subj][currentQuestionIndex];
  const flags = flagsBySubject[subj];
  const flagBtn = document.getElementById('flag-btn');
  flagBtn.className = 'flag-btn' + (flags.has(currentQuestionIndex) ? ' flagged' : '');

  const opts = document.getElementById('options-list');
  opts.innerHTML = '';
  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    const labels = ['A', 'B', 'C', 'D', 'E'];

    if (mode === 'exam' && !examSubmitted) {
      if (selected === i) btn.classList.add('selected');
      btn.onclick = () => selectOption(i);
    } else if (mode === 'practice') {
      if (selected !== undefined) {
        if (i === q.ans) btn.classList.add('correct');
        else if (selected === i) btn.classList.add('wrong');
        btn.disabled = (selected !== undefined);
      }
      if (selected === undefined) btn.onclick = () => selectOption(i);
    } else if (mode === 'exam' && examSubmitted) {
      if (i === q.ans) btn.classList.add('correct');
      else if (selected === i) btn.classList.add('wrong');
    }

    btn.innerHTML = `<span class="option-label">${labels[i]}</span><span class="option-text">${opt}</span>`;
    opts.appendChild(btn);
  });

  const feedback = document.getElementById('practice-feedback');
  if (mode === 'practice' && selected !== undefined) {
    feedback.classList.remove('hidden');
    const badge = document.getElementById('feedback-badge');
    const isCorrect = selected === q.ans;
    badge.className = 'feedback-badge ' + (isCorrect ? 'correct-badge' : 'wrong-badge');
    badge.textContent = isCorrect ? '✓ Correct!' : `✗ Wrong — Answer: ${['A','B','C','D','E'][q.ans]}. ${q.opts[q.ans]}`;
    document.getElementById('feedback-exp').textContent = q.exp || '';
    document.getElementById('ai-box').classList.add('hidden');
    document.getElementById('ai-content').textContent = '';
  } else {
    feedback.classList.add('hidden');
  }

  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  prevBtn.disabled = currentQuestionIndex === 0;
  nextBtn.disabled = currentQuestionIndex === total - 1;

  checkShowSubmitBar();
  updateSubjectTabs();
}

function checkShowSubmitBar() {
  if (mode !== 'exam' || examSubmitted) return;
  const isLastQ = currentQuestionIndex === allQuestions[subjects[currentSubjectIndex]].length - 1;
  const isLastSubj = currentSubjectIndex === subjects.length - 1;
  const submitBar = document.getElementById('submit-bar');
  if (isLastQ && isLastSubj) {
    submitBar.classList.remove('hidden');
  } else {
    submitBar.classList.add('hidden');
  }
}

function selectOption(i) {
  const subj = subjects[currentSubjectIndex];
  answersBySubject[subj][currentQuestionIndex] = i;
  renderQuestion();
  if (mode === 'exam') {
    const total = allQuestions[subj].length;
    if (currentQuestionIndex < total - 1) {
      setTimeout(() => navigate(1), 200);
    }
  }
}

function navigate(dir) {
  const subj = subjects[currentSubjectIndex];
  const total = allQuestions[subj].length;
  const newIdx = currentQuestionIndex + dir;
  if (newIdx >= 0 && newIdx < total) {
    currentQuestionIndex = newIdx;
    renderQuestion();
    document.getElementById('quiz-body').scrollTo(0, 0);
    return;
  }
  if (dir > 0 && currentSubjectIndex < subjects.length - 1) {
    currentSubjectIndex++;
    currentQuestionIndex = 0;
    renderQuestion();
    document.getElementById('quiz-body').scrollTo(0, 0);
  }
  if (dir < 0 && currentSubjectIndex > 0) {
    currentSubjectIndex--;
    currentQuestionIndex = allQuestions[subjects[currentSubjectIndex]].length - 1;
    renderQuestion();
    document.getElementById('quiz-body').scrollTo(0, 0);
  }
}

function toggleFlag() {
  const subj = subjects[currentSubjectIndex];
  const flags = flagsBySubject[subj];
  if (flags.has(currentQuestionIndex)) flags.delete(currentQuestionIndex);
  else flags.add(currentQuestionIndex);
  renderQuestion();
  updateSubjectTabs();
}

function openQuestionGrid() {
  gridSheetSubject = currentSubjectIndex;
  renderSheetTabs();
  renderSheetGrid();
  document.getElementById('question-grid-sheet').classList.remove('hidden');
}

function closeQuestionGrid() {
  document.getElementById('question-grid-sheet').classList.add('hidden');
}

function renderSheetTabs() {
  const tabs = document.getElementById('sheet-tabs');
  tabs.innerHTML = '';
  subjects.forEach((subj, i) => {
    const btn = document.createElement('button');
    btn.className = 'sheet-stab' + (i === gridSheetSubject ? ' active' : '');
    btn.textContent = subj;
    btn.onclick = () => { gridSheetSubject = i; renderSheetTabs(); renderSheetGrid(); };
    tabs.appendChild(btn);
  });
}

function renderSheetGrid() {
  const grid = document.getElementById('sheet-grid');
  const subj = subjects[gridSheetSubject];
  const total = allQuestions[subj].length;
  const answers = answersBySubject[subj];
  const flags = flagsBySubject[subj];
  grid.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const btn = document.createElement('button');
    btn.className = 'grid-num-btn';
    if (flags.has(i)) btn.classList.add('flagged');
    else if (answers[i] !== undefined) btn.classList.add('answered');
    if (gridSheetSubject === currentSubjectIndex && i === currentQuestionIndex) btn.classList.add('current');
    btn.textContent = i + 1;
    btn.onclick = () => {
      currentSubjectIndex = gridSheetSubject;
      currentQuestionIndex = i;
      renderQuestion();
      updateSubjectTabs();
      closeQuestionGrid();
    };
    grid.appendChild(btn);
  }
}

function confirmQuit() {
  if (mode === 'exam' && !examSubmitted) {
    if (!confirm('Quit exam? Your progress will be lost.')) return;
  }
  clearInterval(timerInterval);
  showScreen('home');
}

function submitExam() {
  if (!confirm('Submit your exam? This cannot be undone.')) return;
  clearInterval(timerInterval);
  examSubmitted = true;
  showResults();
}

function showResults() {
  let total = 0, correct = 0;
  const subjectScores = {};
  subjects.forEach(subj => {
    const qs = allQuestions[subj];
    const ans = answersBySubject[subj];
    let sc = 0;
    qs.forEach((q, i) => { if (ans[i] === q.ans) sc++; });
    subjectScores[subj] = { correct: sc, total: qs.length };
    total += qs.length;
    correct += sc;
  });
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('result-pct').textContent = pct + '%';
  document.getElementById('result-fraction').textContent = `${correct} / ${total}`;

  const grade = document.getElementById('result-grade');
  if (pct >= 80) { grade.textContent = '🏆 Excellent!'; grade.className = 'result-grade grade-excellent'; }
  else if (pct >= 65) { grade.textContent = '👍 Good Pass'; grade.className = 'result-grade grade-good'; }
  else if (pct >= 50) { grade.textContent = '📚 Keep Studying'; grade.className = 'result-grade grade-average'; }
  else { grade.textContent = '💪 Keep Practising'; grade.className = 'result-grade grade-poor'; }

  setTimeout(() => {
    const circumference = 326.7;
    const offset = circumference - (pct / 100) * circumference;
    document.getElementById('score-ring-fill').style.strokeDashoffset = offset;
    const color = pct >= 80 ? '#22c55e' : pct >= 65 ? '#fbbf24' : pct >= 50 ? '#f59e0b' : '#ef4444';
    document.getElementById('score-ring-fill').style.stroke = color;
  }, 100);

  const breakdown = document.getElementById('subject-breakdown');
  breakdown.innerHTML = '';
  subjects.forEach(subj => {
    const { correct: sc, total: st } = subjectScores[subj];
    const sp = Math.round((sc / st) * 100);
    const card = document.createElement('div');
    card.className = 'subj-result-card';
    card.innerHTML = `
      <div class="subj-result-top">
        <span class="subj-result-name">${subj}</span>
        <span class="subj-result-score">${sc}/${st} (${sp}%)</span>
      </div>
      <div class="subj-bar-track"><div class="subj-bar-fill" style="width:0%;background:${sp>=65?'#22c55e':sp>=50?'#f59e0b':'#ef4444'}" data-w="${sp}"></div></div>`;
    breakdown.appendChild(card);
  });
  setTimeout(() => {
    breakdown.querySelectorAll('.subj-bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; });
  }, 200);

  const duration = mode === 'exam' ? 5400 - timeLeft : 0;
  const profile = getProfile();
  saveSession({
    id: Date.now(),
    date: new Date().toISOString(),
    mode,
    subjects: subjects.join(', '),
    score: correct,
    total,
    pct,
    duration,
    name: profile ? profile.name : '',
    subjectScores
  });

  if (mode === 'exam') {
    document.getElementById('post-exam-ai-banner').classList.remove('hidden');
  } else {
    document.getElementById('post-exam-ai-banner').classList.add('hidden');
  }

  reviewTab = 'wrong';
  setReviewTab('wrong', document.querySelector('.rtab'));
  showScreen('results');
}

function setReviewTab(tab, el) {
  reviewTab = tab;
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderReviewList();
}

function renderReviewList() {
  const list = document.getElementById('review-list');
  list.innerHTML = '';
  let items = [];
  subjects.forEach(subj => {
    allQuestions[subj].forEach((q, i) => {
      const given = answersBySubject[subj][i];
      let status = given === undefined ? 'unanswered' : given === q.ans ? 'correct' : 'wrong';
      items.push({ subj, q, i, given, status });
    });
  });
  if (reviewTab !== 'all') items = items.filter(it => it.status === reviewTab);
  if (items.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text3);padding:30px 0;font-size:0.9rem">No ${reviewTab} answers</div>`;
    return;
  }
  const labels = ['A', 'B', 'C', 'D', 'E'];
  items.forEach(({ subj, q, i, given, status }) => {
    const el = document.createElement('div');
    el.className = 'review-item';
    const badgeClass = { correct: 'badge-correct', wrong: 'badge-wrong', unanswered: 'badge-skip' }[status];
    const badgeText = { correct: '✓ Correct', wrong: '✗ Wrong', unanswered: '— Skipped' }[status];
    const givenText = given !== undefined ? `${labels[given]}. ${q.opts[given]}` : 'Not answered';
    const correctText = `${labels[q.ans]}. ${q.opts[q.ans]}`;
    const showAiBtn = mode === 'exam' ? examSubmitted : true;
    el.innerHTML = `
      <div class="review-item-header">
        <span class="review-meta">${subj} · Q${i + 1}</span>
        <span class="review-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="review-q">${q.q}</div>
      <div class="review-answers">
        <div class="review-ans-line"><span class="review-ans-label">Your answer:</span><span class="review-ans-val">${givenText}</span></div>
        <div class="review-ans-line"><span class="review-ans-label">Correct:</span><span class="review-ans-val correct-ans">${correctText}</span></div>
      </div>
      ${q.exp ? `<div class="review-exp">${q.exp}</div>` : ''}
      ${showAiBtn ? `<button class="review-ai-btn" onclick="reviewAI(this,'${escapeStr(q.q)}','${escapeStr(q.opts[q.ans])}')"><span>✨</span> AI Explanation</button><div class="review-ai-result hidden"></div>` : ''}
    `;
    list.appendChild(el);
  });
}

function escapeStr(s) {
  return s.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

async function reviewAI(btn, question, answer) {
  const resultEl = btn.nextElementSibling;
  btn.style.display = 'none';
  resultEl.classList.remove('hidden');
  resultEl.textContent = 'Getting AI explanation…';
  try {
    const res = await fetch('/api/ai/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer })
    });
    const d = await res.json();
    resultEl.textContent = d.explanation || 'No explanation available.';
  } catch {
    resultEl.textContent = 'Could not get AI explanation.';
  }
}

async function toggleAI() {
  if (mode === 'exam' && !examSubmitted) return;
  const box = document.getElementById('ai-box');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const subj = subjects[currentSubjectIndex];
  const q = allQuestions[subj][currentQuestionIndex];
  const content = document.getElementById('ai-content');
  box.classList.remove('hidden');
  content.textContent = 'Getting explanation…';
  try {
    const res = await fetch('/api/ai/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.q, answer: q.opts[q.ans] })
    });
    const d = await res.json();
    content.textContent = d.explanation || q.exp || 'No explanation available.';
  } catch {
    content.textContent = q.exp || 'Could not fetch explanation.';
  }
}

function closeAIBox() {
  document.getElementById('ai-box').classList.add('hidden');
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const history = getHistory();
  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">No sessions yet. Start an exam or practice session!</div>';
    return;
  }
  list.innerHTML = '';
  history.forEach(session => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const d = new Date(session.date);
    const dateStr = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    const color = session.pct >= 65 ? 'var(--accent)' : session.pct >= 50 ? 'var(--warn)' : 'var(--danger)';
    card.innerHTML = `
      <div class="history-card-top">
        <span class="history-date">${dateStr} · ${timeStr}</span>
        <span class="history-mode ${session.mode}">${session.mode === 'exam' ? 'Exam' : 'Practice'}</span>
      </div>
      <div class="history-score-row">
        <span class="history-pct" style="color:${color}">${session.pct}%</span>
        <span class="history-fraction">${session.score}/${session.total} correct</span>
      </div>
      <div class="history-subjects">${session.subjects}</div>`;
    list.appendChild(card);
  });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

document.addEventListener('keydown', e => {
  const inQuiz = document.getElementById('screen-quiz').classList.contains('active');
  if (!inQuiz) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
  if (['a','b','c','d'].includes(e.key.toLowerCase())) {
    const idx = 'abcd'.indexOf(e.key.toLowerCase());
    const subj = subjects[currentSubjectIndex];
    const q = allQuestions[subj]?.[currentQuestionIndex];
    if (q && idx < q.opts.length) selectOption(idx);
  }
  if (e.key === 'f' || e.key === 'F') toggleFlag();
});

document.addEventListener('DOMContentLoaded', () => {
  renderHomeUser();
});
