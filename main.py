import os
import random
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from questions_data import QUESTIONS

app = FastAPI()

class AIRequest(BaseModel):
    question: str
    options: list
    correct_answer: str
    subject: str
    mode: str
    explanation: str

class AIKeyRequest(BaseModel):
    key: str

@app.get("/api/questions")
def get_questions(subject: str = None, year: str = None, count: int = 25):
    result = {}
    subjects = [subject] if subject else list(QUESTIONS.keys())
    for subj in subjects:
        if subj not in QUESTIONS:
            continue
        pool = []
        if year and year != "random" and year in QUESTIONS[subj]:
            for q in QUESTIONS[subj][year]:
                pool.append({**q, "subject": subj, "year": year})
        else:
            for yr, qs in QUESTIONS[subj].items():
                for q in qs:
                    pool.append({**q, "subject": subj, "year": yr})
        random.shuffle(pool)
        result[subj] = pool[:count]
    return JSONResponse(content=result)

@app.get("/api/subjects")
def get_subjects():
    summary = {}
    for subj, years in QUESTIONS.items():
        total = sum(len(qs) for qs in years.values())
        summary[subj] = {"years": list(years.keys()), "total": total}
    return JSONResponse(content=summary)

@app.post("/api/ai/explain")
async def ai_explain(req: AIRequest):
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            if req.mode == "hint":
                prompt = f"""You are a helpful exam tutor for Nigerian university entrance exams (UI Post UTME).
                
Question: {req.question}
Options: {', '.join([f'{chr(65+i)}. {opt}' for i, opt in enumerate(req.options)])}
Subject: {req.subject}

Give a helpful HINT that guides the student toward the answer WITHOUT revealing which option is correct.
Keep it brief (2-3 sentences), educational, and encouraging. Focus on the key concept being tested."""
            else:
                prompt = f"""You are a helpful exam tutor for Nigerian university entrance exams (UI Post UTME).
                
Question: {req.question}
Options: {', '.join([f'{chr(65+i)}. {opt}' for i, opt in enumerate(req.options)])}
Correct Answer: {req.correct_answer}
Subject: {req.subject}

Provide a clear, concise explanation (3-4 sentences) of why the correct answer is right.
Include the key biological/chemical/physical/grammatical concept being tested.
Make it easy to remember for exam purposes."""
            response = model.generate_content(prompt)
            return JSONResponse(content={"success": True, "response": response.text, "source": "gemini"})
        except Exception as e:
            pass
    fallback = req.explanation if req.mode != "hint" else f"Think about the core concept: {req.subject} principles related to this topic. Review your notes on this area before choosing your answer."
    return JSONResponse(content={"success": True, "response": fallback, "source": "fallback"})

@app.get("/api/ai/status")
def ai_status():
    has_key = bool(os.environ.get("GEMINI_API_KEY", ""))
    return JSONResponse(content={"enabled": has_key})

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
