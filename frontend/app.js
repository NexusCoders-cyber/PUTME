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

// ── Calculator state ──────────────────────────────────────────
const CALC_SUBJECTS = new Set(['Physics', 'Chemistry']);
let calcValue = '0';
let calcOperand = null;
let calcOperator = null;
let calcJustEvaled = false;

function getProfile() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PROFILE) || 'null'); } catch { return null; }
}

function setProfile(p) {
  localStorage.setItem(STORAGE_PROFILE, JSON.stringify(p));
}

function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tryStoreHistory(data) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(data));
    return true;
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) return false;
    return false;
  }
}

function saveSession(session) {
  let hist = getHistory();
  hist.unshift(session);
  if (hist.length > 50) hist.splice(50);

  if (!tryStoreHistory(hist)) {
    const slimmed = hist.map((s, i) => i === 0 ? s : Object.assign({}, s, { questionsSnapshot: [] }));
    if (!tryStoreHistory(slimmed)) {
      const minimal = hist.slice(0, 15).map((s, i) => i === 0 ? s : Object.assign({}, s, { questionsSnapshot: [] }));
      if (!tryStoreHistory(minimal)) {
        const bare = [hist[0]].map(s => Object.assign({}, s, { questionsSnapshot: [] }));
        tryStoreHistory(bare);
      }
    }
  }
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
  const screen = document.getElementById('screen-' + id);
  screen.classList.add('active');
  window.scrollTo(0, 0);
  const body = screen.querySelector('.screen-body');
  if (body) body.scrollTop = 0;
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
    if (timeLeft <= 0) { clearInterval(timerInterval); forceSubmitExam(); }
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
  document.getElementById('submit-bar').classList.add('hidden');
  document.getElementById('practice-finish-bar').classList.toggle('hidden', mode !== 'practice');

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
    tab.onclick = () => { currentSubjectIndex = i; currentQuestionIndex = 0; renderQuestion(); updateSubjectTabs(); checkShowSubmitBar(); };
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

function updateCalcButton() {
  const subj = subjects[currentSubjectIndex];
  const btn = document.getElementById('calc-toggle-btn');
  if (CALC_SUBJECTS.has(subj)) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
    // Hide calculator if we switch away from a calc subject
    document.getElementById('calculator').classList.add('hidden');
    btn.classList.remove('active');
  }
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
  updateCalcButton();
}

function checkShowSubmitBar() {
  if (mode !== 'exam' || examSubmitted) return;
  const isLastSubj = currentSubjectIndex === subjects.length - 1;
  const submitBar = document.getElementById('submit-bar');
  if (isLastSubj) {
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
  hideCalculator();
  showScreen('home');
}

function forceSubmitExam() {
  clearInterval(timerInterval);
  examSubmitted = true;
  hideCalculator();
  showResults();
}

function submitExam() {
  if (!confirm('Submit your exam? This cannot be undone.')) return;
  clearInterval(timerInterval);
  examSubmitted = true;
  hideCalculator();
  showResults();
}

function finishPractice() {
  hideCalculator();
  showResults();
}

// ── Results modal ─────────────────────────────────────────────
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

  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? '#fbbf24' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const glowColor = pct >= 80 ? 'rgba(34,197,94,0.28)' : pct >= 65 ? 'rgba(251,191,36,0.28)' : pct >= 50 ? 'rgba(245,158,11,0.28)' : 'rgba(239,68,68,0.22)';

  const grade = document.getElementById('result-grade');
  const msg = document.getElementById('result-message');
  if (pct >= 80) {
    grade.textContent = '🏆 Excellent!';
    grade.className = 'result-grade grade-excellent';
    msg.textContent = 'Outstanding performance — you are well prepared!';
  } else if (pct >= 65) {
    grade.textContent = '👍 Good Pass';
    grade.className = 'result-grade grade-good';
    msg.textContent = 'Solid result — a little more work will get you to the top.';
  } else if (pct >= 50) {
    grade.textContent = '📚 Keep Studying';
    grade.className = 'result-grade grade-average';
    msg.textContent = 'You are on the right track — review weak areas below.';
  } else {
    grade.textContent = '💪 Keep Practising';
    grade.className = 'result-grade grade-poor';
    msg.textContent = 'Don\'t give up — use the review section to learn from mistakes.';
  }

  const modal = document.getElementById('results-modal');
  modal.classList.remove('hidden');
  const body = document.getElementById('results-modal-body');
  body.scrollTop = 0;

  document.getElementById('review-section').classList.add('hidden');
  const arrow = document.getElementById('review-toggle-arrow');
  if (arrow) arrow.classList.remove('open');

  setTimeout(() => {
    const circumference = 389.6;
    const offset = circumference - (pct / 100) * circumference;
    const ring = document.getElementById('score-ring-fill');
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = color;
    const glow = document.getElementById('score-ring-glow');
    if (glow) glow.style.boxShadow = `0 0 40px 18px ${glowColor}`;
  }, 80);

  const breakdown = document.getElementById('subject-breakdown');
  breakdown.innerHTML = '';
  const subjIcons = { Biology: '🧬', Chemistry: '⚗️', Physics: '⚡', English: '📖' };
  subjects.forEach(subj => {
    const { correct: sc, total: st } = subjectScores[subj];
    const sp = Math.round((sc / st) * 100);
    const barColor = sp >= 65 ? '#22c55e' : sp >= 50 ? '#f59e0b' : '#ef4444';
    const borderColor = barColor;
    const card = document.createElement('div');
    card.className = 'subj-result-card';
    card.style.borderLeftColor = borderColor;
    card.innerHTML = `
      <div class="subj-result-top">
        <span class="subj-result-name">${subjIcons[subj] || ''} ${subj}</span>
        <span class="subj-result-score" style="color:${barColor}">${sc}/${st} · ${sp}%</span>
      </div>
      <div class="subj-bar-track"><div class="subj-bar-fill" style="width:0%;background:${barColor}" data-w="${sp}"></div></div>`;
    breakdown.appendChild(card);
  });
  setTimeout(() => {
    breakdown.querySelectorAll('.subj-bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; });
  }, 180);

  const duration = mode === 'exam' ? 5400 - timeLeft : 0;
  const profile = getProfile();

  const questionsSnapshot = [];
  subjects.forEach(subj => {
    const qList = allQuestions[subj] || [];
    const answers = answersBySubject[subj] || {};
    qList.forEach((q, i) => {
      const given = answers[i];
      questionsSnapshot.push({
        subj: String(subj),
        qNum: i + 1,
        q: String(q.q || ''),
        opts: Array.isArray(q.opts) ? q.opts.slice() : [],
        given: (typeof given === 'number') ? given : null,
        ans: typeof q.ans === 'number' ? q.ans : 0,
        exp: typeof q.exp === 'string' ? q.exp : ''
      });
    });
  });

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
    subjectScores,
    questionsSnapshot
  });

  if (mode === 'exam') {
    document.getElementById('post-exam-ai-banner').classList.remove('hidden');
  } else {
    document.getElementById('post-exam-ai-banner').classList.add('hidden');
  }

  reviewTab = 'wrong';
}

function toggleReviewSection() {
  const section = document.getElementById('review-section');
  const arrow = document.getElementById('review-toggle-arrow');
  const isHidden = section.classList.contains('hidden');
  if (isHidden) {
    section.classList.remove('hidden');
    arrow.classList.add('open');
    setReviewTab('wrong', document.querySelector('.rtab'));
    setTimeout(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  } else {
    section.classList.add('hidden');
    arrow.classList.remove('open');
  }
}

function closeResults() {
  document.getElementById('results-modal').classList.add('hidden');
  // Reset ring for next session
  document.getElementById('score-ring-fill').style.strokeDashoffset = '326.7';
  showScreen('home');
}

// ── Review ────────────────────────────────────────────────────
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
    const itemClass = { correct: 'is-correct', wrong: 'is-wrong', unanswered: 'is-skip' }[status];
    el.className = `review-item ${itemClass}`;
    const badgeClass = { correct: 'badge-correct', wrong: 'badge-wrong', unanswered: 'badge-skip' }[status];
    const badgeText = { correct: '✓ Correct', wrong: '✗ Wrong', unanswered: '— Skipped' }[status];
    const givenText = given !== undefined ? `${labels[given]}. ${q.opts[given]}` : 'Not answered';
    const correctText = `${labels[q.ans]}. ${q.opts[q.ans]}`;
    const givenClass = status === 'wrong' ? 'review-ans-val wrong-ans' : 'review-ans-val';
    const showAiBtn = mode === 'exam' ? examSubmitted : true;
    el.innerHTML = `
      <div class="review-item-header">
        <span class="review-meta">${subj} · Q${i + 1}</span>
        <span class="review-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="review-q">${q.q}</div>
      <div class="review-answers">
        <div class="review-ans-line"><span class="review-ans-label">You:</span><span class="${givenClass}">${givenText}</span></div>
        <div class="review-ans-line"><span class="review-ans-label">Answer:</span><span class="review-ans-val correct-ans">${correctText}</span></div>
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

// ── History ────────────────────────────────────────────────────
function lagosTime(isoDate) {
  const d = new Date(isoDate);
  const date = d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true });
  return { date, time };
}

function clearHistory() {
  if (!confirm('Delete all session history? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_HISTORY);
  renderHistory();
  renderHomeUser();
  toast('History cleared');
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const history = getHistory();
  if (history.length === 0) {
    list.innerHTML = `
      <div class="hist-empty">
        <div class="hist-empty-icon">📋</div>
        <p>No sessions yet</p>
        <small>Complete an exam or practice session to see it here</small>
      </div>`;
    return;
  }
  list.innerHTML = '';
  history.forEach((session, idx) => {
    const { date, time } = lagosTime(session.date);
    const color = session.pct >= 65 ? '#22c55e' : session.pct >= 50 ? '#f59e0b' : '#ef4444';
    const modeLabel = session.mode === 'exam' ? 'Exam' : 'Practice';
    const modeClass = session.mode === 'exam' ? 'hmode-exam' : 'hmode-practice';

    const mins = session.duration ? Math.floor(session.duration / 60) : null;
    const durationStr = mins ? `· ${mins} min used` : '';

    const card = document.createElement('div');
    card.className = 'hist-card';
    card.innerHTML = `
      <div class="hist-card-top">
        <div class="hist-meta">
          <span class="hist-datetime">📅 ${date} &nbsp;⏰ ${time} (Lagos)</span>
          <span class="hist-badge ${modeClass}">${modeLabel}</span>
        </div>
        <div class="hist-score-row">
          <span class="hist-pct" style="color:${color}">${session.pct}%</span>
          <div class="hist-score-detail">
            <span class="hist-fraction">${session.score} / ${session.total} correct</span>
            <span class="hist-subjects">${session.subjects} ${durationStr}</span>
          </div>
        </div>
        <div class="hist-subj-bars" id="hist-bars-${idx}"></div>
      </div>
      <button class="hist-view-btn" onclick="toggleHistoryAnswers(${idx}, this)">
        <span>📝</span> View Questions &amp; Answers <span class="hist-view-arrow">›</span>
      </button>
      <div class="hist-answers hidden" id="hist-answers-${idx}"></div>
    `;
    list.appendChild(card);

    if (session.subjectScores) {
      const barsEl = card.querySelector(`#hist-bars-${idx}`);
      Object.entries(session.subjectScores).forEach(([subj, data]) => {
        const sp = Math.round((data.correct / data.total) * 100);
        const bc = sp >= 65 ? '#22c55e' : sp >= 50 ? '#f59e0b' : '#ef4444';
        barsEl.innerHTML += `
          <div class="hist-bar-row">
            <span class="hist-bar-label">${subj}</span>
            <div class="hist-bar-track"><div class="hist-bar-fill" style="width:${sp}%;background:${bc}"></div></div>
            <span class="hist-bar-pct" style="color:${bc}">${sp}%</span>
          </div>`;
      });
    }
  });
}

function toggleHistoryAnswers(idx, btn) {
  const panel = document.getElementById(`hist-answers-${idx}`);
  const arrow = btn.querySelector('.hist-view-arrow');
  const isHidden = panel.classList.contains('hidden');

  if (!isHidden) {
    panel.classList.add('hidden');
    btn.classList.remove('open');
    arrow.style.transform = '';
    return;
  }

  const history = getHistory();
  const session = history[idx];
  panel.classList.remove('hidden');
  btn.classList.add('open');
  arrow.style.transform = 'rotate(90deg)';

  if (panel.dataset.rendered) return;
  panel.dataset.rendered = '1';

  if (!session) {
    panel.innerHTML = '<div class="hist-no-snap">Session data not found — it may have been cleared.</div>';
    return;
  }

  const snap = Array.isArray(session.questionsSnapshot) ? session.questionsSnapshot : [];
  if (snap.length === 0) {
    panel.innerHTML = '<div class="hist-no-snap">Question details are not available for this session.</div>';
    return;
  }

  const labels = ['A', 'B', 'C', 'D', 'E'];
  const STATUSES = { correct: 'hq-correct', wrong: 'hq-wrong', skip: 'hq-skip' };
  const STATUS_LABELS = { correct: '✓ Correct', wrong: '✗ Wrong', skip: '— Skipped' };

  let html = '';
  let lastSubj = '';

  snap.forEach(item => {
    if (!item || typeof item !== 'object') return;

    const opts = Array.isArray(item.opts) ? item.opts : [];
    const ans = typeof item.ans === 'number' ? item.ans : 0;
    const given = typeof item.given === 'number' ? item.given : null;

    const subjName = escHtml(String(item.subj || ''));
    if (subjName !== lastSubj) {
      html += `<div class="hist-subj-header">${subjName}</div>`;
      lastSubj = subjName;
    }

    const status = given === null ? 'skip' : given === ans ? 'correct' : 'wrong';
    const borderClass = STATUSES[status];

    const givenLabel = (given !== null && given >= 0 && given < opts.length)
      ? `${labels[given] || '?'}. ${escHtml(String(opts[given]))}`
      : 'Not answered';

    const correctLabel = (ans >= 0 && ans < opts.length)
      ? `${labels[ans] || '?'}. ${escHtml(String(opts[ans]))}`
      : 'Unknown';

    html += `
      <div class="hq-item ${borderClass}">
        <div class="hq-header">
          <span class="hq-num">Q${item.qNum || '—'}</span>
          <span class="hq-badge hq-bdg-${status}">${STATUS_LABELS[status]}</span>
        </div>
        <div class="hq-text">${escHtml(String(item.q || ''))}</div>
        <div class="hq-answers">
          <div class="hq-ans-line">
            <span class="hq-ans-lbl">You:</span>
            <span class="hq-ans-val ${status === 'wrong' ? 'hq-wrong-val' : ''}">${givenLabel}</span>
          </div>
          <div class="hq-ans-line">
            <span class="hq-ans-lbl">Answer:</span>
            <span class="hq-ans-val hq-correct-val">${correctLabel}</span>
          </div>
        </div>
        ${item.exp ? `<div class="hq-exp">${escHtml(String(item.exp))}</div>` : ''}
      </div>`;
  });

  panel.innerHTML = html || '<div class="hist-no-snap">No question data to display.</div>';
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Calculator ────────────────────────────────────────────────
function toggleCalculator() {
  const calc = document.getElementById('calculator');
  const btn = document.getElementById('calc-toggle-btn');
  const isHidden = calc.classList.contains('hidden');
  calc.classList.toggle('hidden');
  btn.classList.toggle('active', isHidden);
}

function hideCalculator() {
  document.getElementById('calculator').classList.add('hidden');
  document.getElementById('calc-toggle-btn').classList.remove('active');
}

function calcUpdateDisplay() {
  let display = calcValue;
  if (calcOperand !== null && calcOperator && !calcJustEvaled) {
    display = String(calcOperand) + ' ' + calcOperator + ' ' + calcValue;
  }
  const el = document.getElementById('calc-display');
  el.textContent = display;
}

function calcDigit(d) {
  if (calcJustEvaled) { calcValue = d; calcJustEvaled = false; }
  else if (calcValue === '0') calcValue = d;
  else if (calcValue.length < 12) calcValue += d;
  calcUpdateDisplay();
}

function calcDot() {
  if (calcJustEvaled) { calcValue = '0.'; calcJustEvaled = false; }
  else if (!calcValue.includes('.')) calcValue += '.';
  calcUpdateDisplay();
}

function calcOp(op) {
  // Normalise to the symbols used in calcEquals (−, ×, ÷, +)
  const sym = op === '-' ? '−' : op;
  if (calcOperand !== null && !calcJustEvaled) {
    calcEquals(true);
  }
  calcOperand = parseFloat(calcValue);
  calcOperator = sym;
  calcJustEvaled = false;
  calcUpdateDisplay();
}

function calcEquals(internal = false) {
  if (calcOperand === null || calcOperator === null) return;
  const a = calcOperand;
  const b = parseFloat(calcValue);
  let result;
  switch (calcOperator) {
    case '+': result = a + b; break;
    case '−': result = a - b; break;
    case '×': result = a * b; break;
    case '÷': result = b !== 0 ? a / b : 'Error'; break;
    default: result = b;
  }
  if (typeof result === 'number') {
    // Trim floating point noise
    result = parseFloat(result.toPrecision(10));
    calcValue = String(result);
  } else {
    calcValue = result;
  }
  if (!internal) {
    calcOperand = null;
    calcOperator = null;
    calcJustEvaled = true;
  }
  calcUpdateDisplay();
}

function calcClear() {
  calcValue = '0';
  calcOperand = null;
  calcOperator = null;
  calcJustEvaled = false;
  calcUpdateDisplay();
}

function calcDel() {
  if (calcJustEvaled || calcValue === '0' || calcValue === 'Error') {
    calcValue = '0'; calcJustEvaled = false;
  } else {
    calcValue = calcValue.length > 1 ? calcValue.slice(0, -1) : '0';
  }
  calcUpdateDisplay();
}

// ── Keyboard shortcuts ────────────────────────────────────────
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
