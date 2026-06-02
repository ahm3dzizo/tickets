"""
ml/classifier_service.py
─────────────────────────
FastAPI microservice — TF-IDF + Logistic Regression classifier.
Runs on port 5050 alongside the Node.js server.
"""

import re
import pickle
import pathlib
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

MODEL_PATH = pathlib.Path(__file__).parent / "model.pkl"

# ── Arabic normalisation (mirrors train.py) ─────────────────────────────────
def normalize(text: str) -> str:
    if not isinstance(text, str):
        return ""
    # strip RTL/LTR control chars
    text = re.sub(r"[​-‏‪-‮⁦-⁩﻿؜]", " ", text)
    text = re.sub(r"[ً-ِْ-ٰٟ]", "", text)   # diacritics
    text = re.sub(r"[أإآ]", "ا", text)             # Alef variants
    text = re.sub(r"ة", "ه", text)                           # Ta-Marbuta
    text = re.sub(r"[ىي]", "ي", text)                   # Ya
    text = re.sub(r"[^؀-ۿ\s]", " ", text)                    # keep Arabic only
    return re.sub(r"\s+", " ", text).strip()

# ── Load model ──────────────────────────────────────────────────────────────
print(f"[ML] Loading model from {MODEL_PATH} ...")
with open(MODEL_PATH, "rb") as f:
    bundle = pickle.load(f)

pipeline = bundle["pipeline"]
classes  = bundle["classes"]
print(f"[ML] Ready — {len(classes)} classes: {classes}")

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Ticket Classifier", version="1.0")

class ClassifyRequest(BaseModel):
    description: str

class BatchItem(BaseModel):
    id: str
    description: str

class BatchRequest(BaseModel):
    items: list[BatchItem]

# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "classes": len(classes)}

@app.get("/classes")
def get_classes():
    return {"classes": classes}

@app.post("/classify")
def classify(req: ClassifyRequest):
    text  = normalize(req.description)
    proba = pipeline.predict_proba([text])[0]
    top   = int(proba.argmax())
    conf  = float(proba[top])
    all_t = [classes[i] for i, p in enumerate(proba) if p > 0.15]
    if classes[top] not in all_t:
        all_t.insert(0, classes[top])
    return {
        "primaryType": classes[top],
        "allTypes":    all_t,
        "confidence":  round(conf, 4),
        "source":      "ml",
    }

@app.post("/classify/batch")
def classify_batch(req: BatchRequest):
    results = []
    for item in req.items:
        text  = normalize(item.description)
        proba = pipeline.predict_proba([text])[0]
        top   = int(proba.argmax())
        conf  = float(proba[top])
        all_t = [classes[i] for i, p in enumerate(proba) if p > 0.15]
        if classes[top] not in all_t:
            all_t.insert(0, classes[top])
        results.append({
            "id":          item.id,
            "primaryType": classes[top],
            "allTypes":    all_t,
            "confidence":  round(conf, 4),
            "source":      "ml",
        })
    return results

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5050, log_level="warning")
