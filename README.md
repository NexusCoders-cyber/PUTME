# UIPrep — University of Ibadan Post UTME CBT App

A full Computer-Based Testing (CBT) platform for University of Ibadan (UI) Post UTME preparation. Built with a **FastAPI (Python)** backend and a clean **Vanilla JS** frontend — no build step required.

---

## Features

- **Exam Mode** — 90-minute countdown, 25 questions per subject, strict exam conditions
- **Practice Mode** — instant answer feedback with explanations, no timer
- **AI Tutor** — built-in explanations always work; upgrades to Google Gemini AI when `GEMINI_API_KEY` is set
- **Calculator** — available in Physics and Chemistry sections
- **Question Navigation** — grid panel, keyboard shortcuts (A/B/C/D, arrow keys, F to flag)
- **Results Screen** — animated score ring, per-subject breakdown, collapsible answer review with corrections
- **200+ Questions** — Biology, Chemistry, Physics, English (2019–2025)

---

## Project Structure

```
/
├── main.py               # FastAPI backend — API routes + serves the frontend
├── questions_data.py     # All questions: Biology, Chemistry, Physics, English
├── requirements.txt      # Python dependencies
├── Procfile              # For Railway / Render / Heroku deployment
├── render.yaml           # Render.com one-click deploy config
├── railway.json          # Railway.app deploy config
└── frontend/
    ├── index.html        # App structure (all screens)
    ├── style.css         # Full CBT UI design
    ├── app.js            # Complete application logic
    └── assets/
        ├── ui_crest.jpg  # University of Ibadan crest (logo + favicon)
        └── ui_gate.jpg   # University of Ibadan gate (home background)
```

---

## Running Locally

**Requirements:** Python 3.10+

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. (Optional) Add Gemini AI key

Get a free key from [aistudio.google.com](https://aistudio.google.com), then:

```bash
# macOS / Linux
export GEMINI_API_KEY=your_key_here

# Windows
set GEMINI_API_KEY=your_key_here
```

Without the key the app works fine — it uses the built-in explanations from the question data.

### 5. Start the server

```bash
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

Open **http://localhost:5000** in your browser.

---

## Deploying via GitHub

### Step 1 — Push your code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

### Option A — Railway *(Recommended — free tier available)*

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your repository — Railway reads `railway.json` automatically
4. Go to **Settings → Networking → Generate Domain** to get your public URL
5. *(Optional)* Add `GEMINI_API_KEY` under the **Variables** tab

Done — your app is live.

---

### Option B — Render *(Free tier available)*

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New → Web Service** and connect your repository
3. Render auto-detects `render.yaml` — click **Deploy**
4. *(Optional)* Add `GEMINI_API_KEY` under **Environment → Environment Variables**

If you prefer manual settings:

| Field | Value |
|---|---|
| Environment | Python |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

---

### Option C — Heroku

```bash
# Install Heroku CLI first: https://devcenter.heroku.com/articles/heroku-cli
heroku login
heroku create your-app-name
heroku config:set GEMINI_API_KEY=your_key_here   # optional
git push heroku main
heroku open
```

The `Procfile` in this repo is already configured for Heroku.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/questions?year=random&count=25` | Returns shuffled questions |
| GET | `/api/subjects` | Subject metadata and question counts |
| POST | `/api/ai/explain` | AI explanation `{ question, answer }` |
| GET | `/api/ai/status` | Whether Gemini key is configured |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | No | Enables AI-powered explanations via Google Gemini |
| `PORT` | Auto-set | Port (set automatically by Railway / Render / Heroku) |

---

## Tech Stack

- **Backend:** Python 3.11 · FastAPI · Uvicorn
- **Frontend:** Vanilla HTML · CSS · JavaScript (no frameworks, no build step)
- **AI:** Google Gemini 1.5 Flash (optional)
- **Data:** 200+ questions from 2019–2025 UI Post UTME exams

---

## Developer

Built by **Raphael Ilom**  
UIPrep · UI Post UTME CBT Platform
