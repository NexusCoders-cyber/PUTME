import os
import time
import random
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from questions_data import QUESTIONS

app = FastAPI()

MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash-8b"]

class AIRequest(BaseModel):
    question: str
    answer: str

@app.get("/api/questions")
def get_questions(subject: str = None, year: str = None, count: int = 25):
    result = {}
    subject_lookup = {s.lower(): s for s in QUESTIONS}

    if subject:
        match = subject_lookup.get(subject.strip().lower())
        subj_list = [match] if match else []
    else:
        subj_list = list(QUESTIONS.keys())

    count = max(1, min(count, 9999))

    for subj in subj_list:
        if subj not in QUESTIONS:
            continue

        pool = []

        if year and year != "random":
            if year in QUESTIONS[subj]:
                for q in QUESTIONS[subj][year]:
                    pool.append({**q, "subject": subj, "year": year})

            if not pool:
                for yr, qs in QUESTIONS[subj].items():
                    for q in qs:
                        pool.append({**q, "subject": subj, "year": yr})
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
    if not api_key:
        return JSONResponse(content={
            "explanation": f"Correct answer: {req.answer}. Review this concept carefully in your notes.",
            "source": "fallback"
        })

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = (
            "You are a helpful exam tutor for Nigerian university entrance exams (UI Post UTME).\n\n"
            f"Question: {req.question}\n"
            f"Correct Answer: {req.answer}\n\n"
            "Give a clear, concise explanation (3-4 sentences) of why this is the correct answer. "
            "Include the key concept being tested. Make it easy to remember for exam purposes."
        )

        last_err = None
        for model in MODELS:
            for attempt in range(3):
                try:
                    response = client.models.generate_content(
                        model=model,
                        contents=prompt
                    )
                    return JSONResponse(content={"explanation": response.text, "source": "gemini"})
                except Exception as e:
                    last_err = str(e)
                    if "429" in last_err or "RESOURCE_EXHAUSTED" in last_err:
                        if attempt < 2:
                            time.sleep(2 ** attempt)
                        continue
                    break

        if "429" in str(last_err) or "RESOURCE_EXHAUSTED" in str(last_err):
            return JSONResponse(content={
                "explanation": "Gemini AI is temporarily rate-limited (free tier). Wait a moment and try again.",
                "source": "quota_error"
            })
        raise Exception(last_err)

    except Exception as e:
        return JSONResponse(content={
            "explanation": f"AI unavailable: {str(e)[:120]}. Review the built-in explanation below.",
            "source": "error"
        })

@app.get("/api/ai/status")
def ai_status():
    has_key = bool(os.environ.get("GEMINI_API_KEY", ""))
    return JSONResponse(content={"enabled": has_key})

if not os.environ.get("VERCEL"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
