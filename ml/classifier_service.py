"""
ml/classifier_service.py
─────────────────────────
FastAPI microservice — TF-IDF + Logistic Regression classifier.
Runs on port 5050 alongside the Node.js server.

Endpoints:
  GET  /health
  GET  /classes
  POST /reload
  POST /classify          → {primaryType, subType, subTypeConf, allTypes, confidence, source}
  POST /classify/batch    → list of above
"""

import re
import pickle
import pathlib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

BASE_DIR   = pathlib.Path(__file__).parent
MODEL_PATH = BASE_DIR / "model.pkl"

# Sub-type model paths keyed by main type
SUBTYPE_MODEL_PATHS: dict[str, pathlib.Path] = {
    "plumbing": BASE_DIR / "model_subtype_plumbing.pkl",
}

# ── Arabic normalisation ─────────────────────────────────────────────────────
def normalize(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"[​-‏‪-‮⁦-⁩﻿؜]", " ", text)
    text = re.sub(r"[ً-ِْ-ٰٟ]", "", text)
    text = re.sub(r"[أإآ]", "ا", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"[ىي]", "ي", text)
    text = re.sub(r"[^؀-ۿ\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

# ── Model loading ─────────────────────────────────────────────────────────────
pipeline = None
classes: list[str] = []
subtype_models: dict[str, dict] = {}

def load_models() -> None:
    """Load model files atomically so a failed reload keeps the current model alive."""
    global pipeline, classes, subtype_models

    print("[ML] Loading main model ...")
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"{MODEL_PATH} not found. Please run ml/train.py first.")

    with open(MODEL_PATH, "rb") as f:
        bundle = pickle.load(f)

    new_pipeline = bundle["pipeline"]
    new_classes = list(bundle["classes"])
    new_subtype_models: dict[str, dict] = {}

    for type_key, model_path in SUBTYPE_MODEL_PATHS.items():
        if model_path.exists():
            with open(model_path, "rb") as f:
                st = pickle.load(f)
            new_subtype_models[type_key] = st
            print(f"[ML] Sub-type model for '{type_key}': {st['classes']}")
        else:
            print(f"[ML] No sub-type model for '{type_key}' (run train_subtype.py)")

    # Swap only after every required model loaded successfully.
    pipeline = new_pipeline
    classes = new_classes
    subtype_models = new_subtype_models
    print(f"[ML] Main model ready — {len(classes)} classes")

try:
    load_models()
except FileNotFoundError as exc:
    print(f"[ML] ERROR: {exc}")
except Exception as exc:
    print(f"[ML] ERROR loading model: {exc}")

# ── Sub-type prediction helper ───────────────────────────────────────────────
SUBTYPE_THRESHOLD = 0.35   # min confidence to assign a sub-type

def predict_subtype(text: str, primary_type: str) -> tuple[str | None, float]:
    """Returns (subType_label, confidence) or (None, 0) if no model / low confidence."""
    model = subtype_models.get(primary_type)
    if not model:
        return None, 0.0
    proba = model["pipeline"].predict_proba([text])[0]
    top   = int(proba.argmax())
    conf  = float(proba[top])
    if conf < SUBTYPE_THRESHOLD:
        return None, conf
    return model["classes"][top], round(conf, 4)

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Ticket Classifier", version="2.1")

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
    return {"status": "ok", "classes": len(classes), "subtype_models": list(subtype_models.keys())}

@app.get("/classes")
def get_classes():
    return {"classes": classes}

@app.post("/reload")
def reload_model():
    try:
        load_models()
    except Exception as exc:
        print(f"[ML] Reload failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "status": "reloaded",
        "classes": len(classes),
        "subtype_models": list(subtype_models.keys()),
    }

@app.post("/classify")
def classify(req: ClassifyRequest):
    if pipeline is None:
        return {
            "primaryType": "unclassified",
            "subType": None,
            "subTypeConf": 0.0,
            "allTypes": ["unclassified"],
            "confidence": 0.0,
            "source": "ml_fallback",
        }

    text  = normalize(req.description)
    proba = pipeline.predict_proba([text])[0]
    top   = int(proba.argmax())
    conf  = float(proba[top])
    all_t = [classes[i] for i, p in enumerate(proba) if p > 0.15]
    if classes[top] not in all_t:
        all_t.insert(0, classes[top])

    sub_type, sub_conf = predict_subtype(text, classes[top])

    return {
        "primaryType":  classes[top],
        "subType":      sub_type,
        "subTypeConf":  sub_conf,
        "allTypes":     all_t,
        "confidence":   round(conf, 4),
        "source":       "ml",
    }

@app.post("/classify/batch")
def classify_batch(req: BatchRequest):
    results = []
    if pipeline is None:
        for item in req.items:
            results.append({
                "id":          item.id,
                "primaryType": "unclassified",
                "subType":     None,
                "subTypeConf": 0.0,
                "allTypes":    ["unclassified"],
                "confidence":  0.0,
                "source":      "ml_fallback",
            })
        return results

    for item in req.items:
        text  = normalize(item.description)
        proba = pipeline.predict_proba([text])[0]
        top   = int(proba.argmax())
        conf  = float(proba[top])
        all_t = [classes[i] for i, p in enumerate(proba) if p > 0.15]
        if classes[top] not in all_t:
            all_t.insert(0, classes[top])

        sub_type, sub_conf = predict_subtype(text, classes[top])

        results.append({
            "id":          item.id,
            "primaryType": classes[top],
            "subType":     sub_type,
            "subTypeConf": sub_conf,
            "allTypes":    all_t,
            "confidence":  round(conf, 4),
            "source":      "ml",
        })
    return results

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5050, log_level="warning")
