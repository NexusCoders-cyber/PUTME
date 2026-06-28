const SUBJECT_COLORS = {Biology:"bio",Chemistry:"chem",Physics:"phys",English:"eng"};
const SUBJECT_ICONS = {Biology:"🧬",Chemistry:"⚗️",Physics:"⚡",English:"📖"};

let mode = "exam";
let lastMode = "exam";
let allQuestions = {};
let currentSubjectIndex = 0;
let currentQuestionIndex = 0;
let subjects = [];
let answersBySubject = {};
let flagsBySubject = {};
let timerInterval = null;
let timeLeft = 5400;
let examSubmitted = false;
let reviewTab = "all";

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + id).classList.add("active");
  window.scrollTo(0, 0);
}

function openSetup(m) {
  mode = m;
  lastMode = m;
  const title = document.getElementById("setup-title");
  const sub = document.getElementById("setup-sub");
  const info = document.getElementById("exam-info");
  const countField = document.getElementById("count-field");
  if (m === "exam") {
    title.textContent = "Exam Mode Setup";
    sub.textContent = "Configure your timed exam session";
    info.style.display = "block";
    countField.style.display = "block";
  } else {
    title.textContent = "Practice Mode Setup";
    sub.textContent = "Choose what to practise";
    info.style.display = "none";
    countField.style.display = "block";
  }
  showScreen("setup");
}

function toggleSubject(el) {
  el.classList.toggle("selected");
}

function getSelectedSubjects() {
  return [...document.querySelectorAll("#subject-grid .subj-chip.selected")].map(el => el.dataset.subject);
}

async function startSession() {
  const selSubjects = getSelectedSubjects();
  if (selSubjects.length === 0) { toast("Select at least one subject"); return; }
  const year = document.getElementById("year-select").value;
  const countRaw = document.getElementById("count-select").value;
  const count = countRaw === "all" ? 9999 : parseInt(countRaw);
  document.getElementById("start-btn").textContent = "Loading...";
  document.getElementById("start-btn").disabled = true;
  try {
    const params = new URLSearchParams({ year, count });
    const res = await fetch(`/api/questions?${params}`);
    const data = await res.json();
    allQuestions = {};
    subjects = [];
    selSubjects.forEach(subj => {
      if (data[subj] && data[subj].length > 0) {
        allQuestions[subj] = data[subj];
        subjects.push(subj);
      }
    });
    if (subjects.length === 0) { toast("No questions found"); return; }
    answersBySubject = {};
    flagsBySubject = {};
    subjects.forEach(s => { answersBySubject[s] = {}; flagsBySubject[s] = new Set(); });
    currentSubjectIndex = 0;
    currentQuestionIndex = 0;
    examSubmitted = false;
    if (mode === "exam") {
      timeLeft = 5400;
    }
    buildQuizUI();
    showScreen("quiz");
    if (mode === "exam") startTimer();
    renderQuestion();
  } catch(e) {
    toast("Error loading questions. Please try again.");
  } finally {
    document.getElementById("start-btn").textContent = "Start Session →";
    document.getElementById("start-btn").disabled = false;
  }
}

function buildQuizUI() {
  const tabsContainer = document.getElementById("subject-tabs");
  tabsContainer.innerHTML = "";
  subjects.forEach((subj, i) => {
    const tab = document.createElement("button");
    tab.className = "subj-tab" + (i === 0 ? " active" : "");
    tab.dataset.index = i;
    tab.dataset.color = SUBJECT_COLORS[subj] || "bio";
    const qs = allQuestions[subj] || [];
    const answered = Object.keys(answersBySubject[subj] || {}).length;
    tab.innerHTML = `${SUBJECT_ICONS[subj] || ""} ${subj} <span class="tab-count">${answered}/${qs.length}</span>`;
    tab.onclick = () => switchSubject(i);
    tabsContainer.appendChild(tab);
  });
  const timerWrap = document.getElementById("timer-wrap");
  if (mode !== "exam") {
    timerWrap.classList.add("hidden");
  } else {
    timerWrap.classList.remove("hidden");
  }
  renderSidebar();
}

function switchSubject(index) {
  currentSubjectIndex = index;
  currentQuestionIndex = 0;
  document.querySelectorAll(".subj-tab").forEach((t, i) => {
    t.classList.toggle("active", i === index);
  });
  renderSidebar();
  renderQuestion();
}

function renderSidebar() {
  const subj = subjects[currentSubjectIndex];
  const qs = allQuestions[subj] || [];
  const answers = answersBySubject[subj] || {};
  const flags = flagsBySubject[subj] || new Set();
  document.getElementById("sidebar-header").textContent = `${subj} · ${qs.length} Questions`;
  const grid = document.getElementById("q-grid");
  grid.innerHTML = "";
  qs.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = "q-dot";
    dot.textContent = i + 1;
    if (i === currentQuestionIndex) dot.classList.add("current");
    if (answers[i] !== undefined) dot.classList.add("answered");
    if (flags.has(i)) dot.classList.add("flagged");
    dot.onclick = () => { currentQuestionIndex = i; renderQuestion(); renderSidebar(); };
    grid.appendChild(dot);
  });
  const answered = Object.keys(answers).length;
  const total = qs.length;
  const pct = total > 0 ? Math.round(answered / total * 100) : 0;
  document.getElementById("sidebar-progress").innerHTML = `
    <div class="prog-row"><span>${answered} answered</span><span>${total - answered} left</span></div>
    <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
  `;
}

function updateTabCounts() {
  document.querySelectorAll(".subj-tab").forEach((tab, i) => {
    const subj = subjects[i];
    const qs = allQuestions[subj] || [];
    const answered = Object.keys(answersBySubject[subj] || {}).length;
    const countEl = tab.querySelector(".tab-count");
    if (countEl) countEl.textContent = `${answered}/${qs.length}`;
  });
}

function renderQuestion() {
  const subj = subjects[currentSubjectIndex];
  const qs = allQuestions[subj] || [];
  const q = qs[currentQuestionIndex];
  if (!q) return;
  const answers = answersBySubject[subj];
  const flags = flagsBySubject[subj];
  const userAnswer = answers[currentQuestionIndex];
  const letters = ["A","B","C","D","E"];
  document.getElementById("q-subject-tag").textContent = `${subj} ${q.year || ""}`.trim();
  document.getElementById("q-num").textContent = currentQuestionIndex + 1;
  document.getElementById("q-total").textContent = qs.length;
  document.getElementById("footer-progress").textContent = `${currentQuestionIndex + 1} / ${qs.length}`;
  const flagBtn = document.getElementById("flag-btn");
  if (flags.has(currentQuestionIndex)) {
    flagBtn.classList.add("flagged");
    flagBtn.textContent = "⚑ Flagged";
  } else {
    flagBtn.classList.remove("flagged");
    flagBtn.textContent = "⚑ Flag";
  }
  document.getElementById("q-text").textContent = (currentQuestionIndex + 1) + ". " + q.q;
  const optList = document.getElementById("options-list");
  optList.innerHTML = "";
  const isPracticeRevealed = mode === "practice" && userAnswer !== undefined;
  q.opts.forEach((opt, i) => {
    const li = document.createElement("div");
    li.className = "option";
    if (isPracticeRevealed) li.classList.add("locked");
    if (userAnswer === i) li.classList.add("selected");
    if (isPracticeRevealed) {
      if (i === q.ans) li.classList.add("correct");
      else if (userAnswer === i) li.classList.add("wrong");
    }
    li.innerHTML = `<span class="opt-letter">${letters[i]}</span><span class="opt-text">${opt}</span>`;
    if (!isPracticeRevealed) {
      li.onclick = () => selectOption(i);
    }
    optList.appendChild(li);
  });
  const expPanel = document.getElementById("explanation-panel");
  if (isPracticeRevealed) {
    expPanel.style.display = "block";
    expPanel.innerHTML = `<strong>💡 Explanation:</strong> ${q.exp}`;
  } else {
    expPanel.style.display = "none";
  }
  closeAI();
  const aiHintBtn = document.getElementById("ai-hint-btn");
  if (mode === "exam") {
    aiHintBtn.textContent = "🤖 Hint";
    aiHintBtn.style.display = "flex";
  } else if (isPracticeRevealed) {
    aiHintBtn.textContent = "🤖 AI Tutor";
    aiHintBtn.style.display = "flex";
  } else {
    aiHintBtn.textContent = "🤖 Hint";
    aiHintBtn.style.display = "flex";
  }
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  prevBtn.disabled = currentQuestionIndex === 0;
  const isLast = currentQuestionIndex === qs.length - 1;
  nextBtn.textContent = isLast ? (currentSubjectIndex === subjects.length - 1 ? "Finish →" : "Next Subject →") : "Next →";
}

function selectOption(i) {
  const subj = subjects[currentSubjectIndex];
  if (mode === "practice" && answersBySubject[subj][currentQuestionIndex] !== undefined) return;
  answersBySubject[subj][currentQuestionIndex] = i;
  updateTabCounts();
  renderSidebar();
  renderQuestion();
}

function navigate(dir) {
  const subj = subjects[currentSubjectIndex];
  const qs = allQuestions[subj] || [];
  const newIndex = currentQuestionIndex + dir;
  if (newIndex >= 0 && newIndex < qs.length) {
    currentQuestionIndex = newIndex;
  } else if (dir > 0 && currentSubjectIndex < subjects.length - 1) {
    currentSubjectIndex++;
    currentQuestionIndex = 0;
    document.querySelectorAll(".subj-tab").forEach((t, i) => {
      t.classList.toggle("active", i === currentSubjectIndex);
    });
  } else if (dir < 0 && currentSubjectIndex > 0) {
    currentSubjectIndex--;
    const prevSubj = subjects[currentSubjectIndex];
    currentQuestionIndex = allQuestions[prevSubj].length - 1;
    document.querySelectorAll(".subj-tab").forEach((t, i) => {
      t.classList.toggle("active", i === currentSubjectIndex);
    });
  }
  renderSidebar();
  renderQuestion();
}

function toggleFlag() {
  const subj = subjects[currentSubjectIndex];
  const flags = flagsBySubject[subj];
  if (flags.has(currentQuestionIndex)) {
    flags.delete(currentQuestionIndex);
    toast("Flag removed");
  } else {
    flags.add(currentQuestionIndex);
    toast("⚑ Question flagged");
  }
  renderSidebar();
  renderQuestion();
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      toast("⏰ Time's up! Submitting...");
      setTimeout(submitExam, 1500);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  document.getElementById("timer-display").textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  const wrap = document.getElementById("timer-wrap");
  wrap.classList.remove("warn", "danger");
  if (timeLeft <= 300) wrap.classList.add("warn");
  if (timeLeft <= 60) wrap.classList.add("danger");
}

function showSubmitConfirm() {
  let totalUnanswered = 0;
  subjects.forEach(subj => {
    const qs = allQuestions[subj] || [];
    const answers = answersBySubject[subj] || {};
    totalUnanswered += qs.length - Object.keys(answers).length;
  });
  const msg = totalUnanswered > 0
    ? `You have ${totalUnanswered} unanswered question${totalUnanswered > 1 ? "s" : ""}. Submit anyway?`
    : "All questions answered! Ready to submit?";
  document.getElementById("submit-modal-msg").textContent = msg;
  openModal("submit-modal");
}

function submitExam() {
  clearInterval(timerInterval);
  closeModal("submit-modal");
  examSubmitted = true;
  showResults();
}

function retrySession() {
  subjects.forEach(subj => {
    answersBySubject[subj] = {};
    flagsBySubject[subj] = new Set();
  });
  currentSubjectIndex = 0;
  currentQuestionIndex = 0;
  examSubmitted = false;
  if (mode === "exam") timeLeft = 5400;
  buildQuizUI();
  showScreen("quiz");
  if (mode === "exam") startTimer();
  renderQuestion();
}

function showResults() {
  let totalCorrect = 0, totalWrong = 0, totalUnanswered = 0, total = 0;
  const subjectResults = {};
  subjects.forEach(subj => {
    const qs = allQuestions[subj] || [];
    const answers = answersBySubject[subj] || {};
    let correct = 0, wrong = 0, unanswered = 0;
    qs.forEach((q, i) => {
      if (answers[i] === undefined) unanswered++;
      else if (answers[i] === q.ans) correct++;
      else wrong++;
    });
    subjectResults[subj] = { correct, wrong, unanswered, total: qs.length };
    totalCorrect += correct;
    totalWrong += wrong;
    totalUnanswered += unanswered;
    total += qs.length;
  });
  const pct = total > 0 ? Math.round(totalCorrect / total * 100) : 0;
  const circle = document.getElementById("score-circle");
  document.getElementById("score-percent").textContent = pct + "%";
  circle.className = "score-circle " + (pct >= 50 ? "pass" : "fail");
  const breakdown = document.getElementById("score-breakdown");
  breakdown.innerHTML = `
    <div class="score-row"><span class="score-row-label">Correct</span><span class="score-row-num correct">${totalCorrect}</span><div class="score-row-bar"><div class="score-bar-fill correct" style="width:${total>0?totalCorrect/total*100:0}%"></div></div></div>
    <div class="score-row"><span class="score-row-label">Wrong</span><span class="score-row-num wrong">${totalWrong}</span><div class="score-row-bar"><div class="score-bar-fill wrong" style="width:${total>0?totalWrong/total*100:0}%"></div></div></div>
    <div class="score-row"><span class="score-row-label">Unanswered</span><span class="score-row-num unanswered">${totalUnanswered}</span><div class="score-row-bar"><div class="score-bar-fill unanswered" style="width:${total>0?totalUnanswered/total*100:0}%"></div></div></div>
    <div class="score-row"><span class="score-row-label">Total</span><span class="score-row-num" style="color:var(--text)">${total}</span></div>
  `;
  const msg = pct >= 70 ? "🎉 Excellent performance! You're ready for UI Post UTME!" : pct >= 50 ? "👍 Good effort! Keep practising to improve." : "📚 Keep studying — review the explanations and try again!";
  document.getElementById("results-message").textContent = msg;
  const subjectScoresEl = document.getElementById("subject-scores");
  subjectScoresEl.innerHTML = "";
  subjects.forEach(subj => {
    const r = subjectResults[subj];
    const sp = r.total > 0 ? Math.round(r.correct / r.total * 100) : 0;
    const card = document.createElement("div");
    card.className = "subj-score-card";
    card.dataset.color = SUBJECT_COLORS[subj] || "bio";
    card.innerHTML = `
      <div class="ssc-name">${SUBJECT_ICONS[subj] || ""} ${subj}</div>
      <div class="ssc-score" style="color:${sp>=50?"var(--correct)":"var(--wrong)"}">${sp}%</div>
      <div class="ssc-detail">${r.correct}/${r.total} correct</div>
    `;
    subjectScoresEl.appendChild(card);
  });
  renderReview("all");
  showScreen("results");
}

function setReviewTab(filter, btn) {
  reviewTab = filter;
  document.querySelectorAll(".rtab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  renderReview(filter);
}

function renderReview(filter) {
  const list = document.getElementById("review-list");
  list.innerHTML = "";
  const letters = ["A","B","C","D","E"];
  let qNum = 0;
  subjects.forEach(subj => {
    const qs = allQuestions[subj] || [];
    const answers = answersBySubject[subj] || {};
    qs.forEach((q, i) => {
      qNum++;
      const userAns = answers[i];
      const isCorrect = userAns === q.ans;
      const isUnanswered = userAns === undefined;
      if (filter === "wrong" && (isCorrect || isUnanswered)) return;
      if (filter === "unanswered" && !isUnanswered) return;
      if (filter === "correct" && !isCorrect) return;
      const item = document.createElement("div");
      item.className = "review-item " + (isUnanswered ? "" : isCorrect ? "r-correct" : "r-wrong");
      let ansChips = "";
      if (isUnanswered) {
        ansChips = `<div class="r-answer-chip unanswered">✗ Not answered</div>`;
      } else {
        const cls = isCorrect ? "your-correct" : "your-wrong";
        ansChips = `<div class="r-answer-chip ${cls}">${isCorrect ? "✓" : "✗"} You: ${letters[userAns]}. ${q.opts[userAns]}</div>`;
        if (!isCorrect) {
          ansChips += `<div class="r-answer-chip correct-ans">✓ Correct: ${letters[q.ans]}. ${q.opts[q.ans]}</div>`;
        }
      }
      item.innerHTML = `
        <div class="r-meta">Q${qNum} · ${subj} ${q.year || ""}</div>
        <div class="r-question">${q.q}</div>
        <div class="r-answers">${ansChips}</div>
        <button class="toggle-exp-btn" onclick="toggleExp(this)">Show explanation</button>
        <div class="r-exp">${q.exp}</div>
      `;
      list.appendChild(item);
    });
  });
  if (list.children.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text3);padding:40px">Nothing here 🎉</div>`;
  }
}

function toggleExp(btn) {
  const exp = btn.nextElementSibling;
  exp.classList.toggle("show");
  btn.textContent = exp.classList.contains("show") ? "Hide explanation" : "Show explanation";
}

async function askAI(aiMode) {
  const subj = subjects[currentSubjectIndex];
  const qs = allQuestions[subj] || [];
  const q = qs[currentQuestionIndex];
  if (!q) return;
  const letters = ["A","B","C","D","E"];
  const panel = document.getElementById("ai-panel");
  const content = document.getElementById("ai-content");
  const actions = document.getElementById("ai-actions");
  panel.style.display = "block";
  content.innerHTML = `<div class="ai-loading">🤖 AI is thinking...</div>`;
  if (aiMode === "hint") {
    actions.innerHTML = `<button class="btn-ai-action" onclick="askAI('explain')">Full Explanation</button>`;
  } else {
    actions.innerHTML = "";
  }
  try {
    const res = await fetch("/api/ai/explain", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        question: q.q,
        options: q.opts,
        correct_answer: `${letters[q.ans]}. ${q.opts[q.ans]}`,
        subject: subj,
        mode: aiMode,
        explanation: q.exp
      })
    });
    const data = await res.json();
    const sourceTag = data.source === "gemini" ? `<span style="font-size:11px;color:var(--text3);display:block;margin-top:8px">✨ Google Gemini AI</span>` : `<span style="font-size:11px;color:var(--text3);display:block;margin-top:8px">📝 Built-in explanation</span>`;
    content.innerHTML = data.response.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>") + sourceTag;
  } catch(e) {
    content.innerHTML = `<div style="color:var(--wrong)">Could not connect to AI. Check your connection.</div>`;
  }
}

function closeAI() {
  const panel = document.getElementById("ai-panel");
  panel.style.display = "none";
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function showAISetup() {
  openModal("ai-key-modal");
  checkAIStatus();
}

async function checkAIStatus() {
  const el = document.getElementById("ai-status-display");
  try {
    const res = await fetch("/api/ai/status");
    const data = await res.json();
    if (data.enabled) {
      el.className = "ai-status enabled";
      el.textContent = "✓ Gemini AI is active and ready!";
    } else {
      el.className = "ai-status disabled";
      el.textContent = "⚠ No API key found — using built-in explanations";
    }
  } catch(e) {
    el.className = "ai-status disabled";
    el.textContent = "Could not check AI status";
  }
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

document.addEventListener("keydown", e => {
  const inQuiz = document.getElementById("screen-quiz").classList.contains("active");
  if (!inQuiz) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") navigate(1);
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") navigate(-1);
  if (["a","b","c","d"].includes(e.key.toLowerCase())) {
    const idx = "abcd".indexOf(e.key.toLowerCase());
    const subj = subjects[currentSubjectIndex];
    const q = allQuestions[subj]?.[currentQuestionIndex];
    if (q && idx < q.opts.length) selectOption(idx);
  }
  if (e.key === "f" || e.key === "F") toggleFlag();
  if (e.key === "Escape") closeAI();
});
