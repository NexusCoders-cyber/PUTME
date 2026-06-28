# UIPrep — UI Post UTME CBT App

A complete Computer-Based Testing (CBT) platform for University of Ibadan (UI) Post UTME preparation.

## Architecture

- **Backend**: FastAPI (Python) on port 5000 — serves both the API and static frontend files
- **Frontend**: Vanilla HTML/CSS/JS (separate files in `/frontend/`)
- **Questions**: `questions_data.py` — Python dict with 200+ questions from 2019–2025

## Project Structure

```
/
├── main.py              # FastAPI backend + API routes + static file serving
├── questions_data.py    # All questions: Biology, Chemistry, Physics, English
└── frontend/
    ├── index.html       # App structure (all screens)
    ├── style.css        # Full CBT UI design (testdriller/myschool.ng style)
    └── app.js           # Complete application logic
```

## Features

- **Exam Mode**: 90-minute countdown, 25 questions per subject, subject-by-subject navigation
- **Practice Mode**: Instant feedback, explanations shown, no timer
- **AI Tutor**: Built-in explanations always work; Google Gemini AI upgrades them when GEMINI_API_KEY is set
- **Question Navigation**: Sidebar grid, keyboard shortcuts (A/B/C/D, arrow keys, F to flag)
- **Results Screen**: Per-subject breakdown, review wrong/correct/unanswered questions

## Running the App

```bash
uvicorn main:app --host 0.0.0.0 --port 5000
```

## API Endpoints

- `GET /api/questions?year=random&count=25` — returns shuffled questions
- `GET /api/subjects` — returns subject metadata and question counts
- `POST /api/ai/explain` — AI explanation endpoint (uses Gemini if key is set)
- `GET /api/ai/status` — checks if Gemini API key is configured

## AI Setup (Free)

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in
2. Click **Get API key** → Create free key
3. Add to Replit secrets as `GEMINI_API_KEY`

Without a key, the app uses built-in explanations from the question data.

## User Preferences

- No comments in code
- Separate HTML/CSS/JS files
- FastAPI backend serving static frontend files
- Dark theme professional CBT design (testdriller/myschool.ng style)
- No emojis in code output unless asked
