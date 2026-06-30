import os
import random
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from questions_data import QUESTIONS

app = FastAPI()

class AIRequest(BaseModel):
    question: str
    answer: str

@app.get("/api/questions")
def get_questions(subject: str = None, year: str = None, count: int = 25):
    result = {}
    subj_list = [subject] if subject else list(QUESTIONS.keys())

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
    if api_key:
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
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            return JSONResponse(content={"explanation": response.text, "source": "gemini"})
        except Exception:
            pass

    return JSONResponse(content={
        "explanation": f"Correct answer: {req.answer}. Review this concept in your textbook.",
        "source": "fallback"
    })

@app.get("/api/ai/status")
def ai_status():
    has_key = bool(os.environ.get("GEMINI_API_KEY", ""))
    return JSONResponse(content={"enabled": has_key})

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
