"""
ml/classifier_service.py
─────────────────────────
FastAPI microservice — wraps the trained TF-IDF + LR model.
Runs on port 5050 alongside the Node.js server.

Endpoints:
  POST /classify          { "description": "..." }
  POST /classify/batch    { "items": [{"id":"..","description":".."}] }
  GET  /health
  GET  /classes
"""

import re
import pickle
import pathlib
from typing import Optional
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

MODEL_PATH = pathlib.Path(__file__).parent / "model.pkl"

# ── Load model ──────────────────────────────────────────────────────────────
print(f"[ML] Loading model from {MODEL_PATH} ...")
with open(MODEL_PATH, "rb") as f:
    bundle = pickle.load(f)

pipeline  = bundle["pipeline"]
classes   = bundle["classes"]
normalize = bundle["normalize"]

print(f"[ML] Model ready — classes: {classes}")

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Ticket Classifier", version="1.0")

# ── Schemas ─────────────────────────────────────────────────────────────────
class ClassifyRequest(BaseModel):
    description: str

class ClassifyResult(BaseModel):
    primaryType:  str
    allTypes:     list[str]
    confidence:   float
    source:       str = "ml"

class BatchItem(BaseModel):
    id:          str
    description: str

class BatchRequest(BaseModel):
    items: list[BatchItem]

class BatchResultItem(BaseModel):
    id:          str
    primaryType: str
    allTypes:    list[str]
    confidence:  float
    source:      str = "ml"

# ── Routes ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "classes": len(classes)}

@app.get("/classes")
def get_classes():
    return {"classes": classes}

@app.post("/classify", response_model=ClassifyResult)
def classify(req: ClassifyRequest):
    text  = normalize(req.description)
    proba = pipeline.predict_proba([text])[0]

    top_idx   = proba.argmax()
    top_type  = classes[top_idx]
    top_conf  = float(proba[top_idx])

    # all types with probability > 15%
    all_types = [classes[i] for i, p in enumerate(proba) if p > 0.15]
    if top_type not in all_types:
        all_types.insert(0, top_type)

    return ClassifyResult(
        primaryType = top_type,
        allTypes    = all_types,
        confidence  = round(top_conf, 4),
    )

@app.post("/classify/batch", response_model=list[BatchResultItem])
def classify_batch(req: BatchRequest):
    results = []
    for item in req.items:
        text  = normalize(item.description)
        proba = pipeline.predict_proba([text])[0]

        top_idx  = proba.argmax()
        top_type = classes[top_idx]
        top_conf = float(proba[top_idx])

        all_types = [classes[i] for i, p in enumerate(proba) if p > 0.15]
        if top_type not in all_types:
            all_types.insert(0, top_type)

        results.append(BatchResultItem(
            id          = item.id,
            primaryType = top_type,
            allTypes    = all_types,
            confidence  = round(top_conf, 4),
        ))
    return results

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5050, log_level="warning")
