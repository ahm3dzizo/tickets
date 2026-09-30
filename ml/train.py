"""
ml/train.py
───────────
Trains TF-IDF + Logistic Regression on the Excel ground-truth tickets.
Reports cross-validation accuracy and saves the live model outside the Git checkout.

Run:  python3 ml/train.py
"""

import re
import os
import pickle
import pathlib
import tempfile
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report

# ── Config ─────────────────────────────────────────────────────────────────
BASE_DIR    = pathlib.Path(__file__).parent
RUNTIME_DIR = pathlib.Path(os.environ.get("RETAL_ML_RUNTIME_DIR", "/var/lib/retal/ml"))
SEED_DIR    = BASE_DIR / "seeds"
EXCEL_PATH  = BASE_DIR.parent / "NTF1 Ticket (2).xlsm"
EXTRA_CSV   = BASE_DIR / "extra_training.csv"
DB_CSV      = RUNTIME_DIR / "db_tickets.csv"
SEED_DB_CSV = SEED_DIR / "db_tickets.csv"
MODEL_PATH  = RUNTIME_DIR / "model.pkl"
MIN_SAMPLES = 10   # drop classes with fewer training samples

RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

# ── Arabic category → system type key ──────────────────────────────────────
CATEGORY_MAP = {
    "سباكة": "plumbing",    "سباكه": "plumbing",
    "كهرباء": "electricity",
    "المنيوم": "doors_windows", "المونيوم": "doors_windows",
    "الموينوم": "doors_windows",
    "دهانات": "paints",     "دهان": "paints",
    "سيراميك": "ceramics",  "سراميك": "ceramics",  "سيرامبك": "ceramics",
    "عزل": "waterproofing",
    "خشب": "doors",         "ابواب خشب": "doors",
    "رخام": "ceramics",
    "جبس": "paints",
    "نمل": "pest_control",
    "كراج":  "garage_door", "كاراج": "garage_door",
    "ابواب جراج": "garage_door", "باب جراج": "garage_door",
    "زجاج": "doors_windows",
    "تشققات": "cracks",  "تشقق": "cracks",  "شقوق": "cracks",
}

def resolve_type(raw: str) -> str | None:
    # strip RTL/LTR control chars
    raw = re.sub(r"[​-‏‪-‮⁦-⁩﻿؜]", " ", raw).strip()
    if raw in CATEGORY_MAP:
        return CATEGORY_MAP[raw]
    # combined category → first one wins
    for part in re.split(r"[،,+\-]", raw):
        key = CATEGORY_MAP.get(part.strip())
        if key:
            return key
    return None

# ── Arabic text normalisation ───────────────────────────────────────────────
def normalize(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"[​-‏‪-‮⁦-⁩﻿؜]", " ", text)
    text = re.sub(r"[ً-ٰٟ]", "", text)          # diacritics
    text = re.sub(r"[أإآ]", "ا", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"[ىي]", "ي", text)
    text = re.sub(r"[^؀-ۿ\s]", " ", text)  # keep Arabic + spaces
    text = re.sub(r"\s+", " ", text).strip()
    return text

# ── Load Excel (optional seed data) ─────────────────────────────────────────
records = []
if EXCEL_PATH.exists():
    print(f"📂 Reading {EXCEL_PATH.name} ...")
    df_raw = pd.read_excel(EXCEL_PATH, sheet_name=0, header=None, engine="openpyxl")

    header_row = None
    for i, row in df_raw.iterrows():
        if row.astype(str).str.contains("الوصف").any():
            header_row = i
            break

    if header_row is not None:
        df = df_raw.iloc[header_row + 1:].copy()
        df.columns = df_raw.iloc[header_row].tolist()
        df = df.reset_index(drop=True)

        desc_col = next((c for c in df.columns if "الوصف" in str(c)), None)
        type_col = next((c for c in df.columns if "تصنيف" in str(c)), None)

        if desc_col and type_col:
            print(f"✅ Header at row {header_row+1} — desc='{desc_col}' type='{type_col}'")
            for _, row in df.iterrows():
                raw_type = str(row.get(type_col, "") or "").strip()
                raw_desc = str(row.get(desc_col, "") or "").strip()
                if not raw_desc or not raw_type:
                    continue
                if raw_type in ("مكرره", "nan") or "خارج" in raw_type:
                    continue
                label = resolve_type(raw_type)
                if not label:
                    continue
                text = normalize(raw_desc)
                if len(text) < 5:
                    continue
                records.append({"text": text, "label": label})
else:
    print(f"⚠️  {EXCEL_PATH.name} not found — training on DB + extra CSV only")

dataset = pd.DataFrame(records)

# ── Load extra training data ─────────────────────────────────────────────────
db_source = DB_CSV if DB_CSV.exists() else SEED_DB_CSV
for csv_path in [EXTRA_CSV, db_source]:
    if csv_path.exists():
        extra = pd.read_csv(csv_path)
        extra["text"] = extra["text"].apply(normalize)
        extra = extra[extra["text"].str.len() >= 5]
        # DB tickets: deduplicate against Excel data by text
        if csv_path == db_source:
            existing_texts = set(dataset["text"].tolist())
            extra = extra[~extra["text"].isin(existing_texts)]
        dataset = pd.concat([dataset, extra], ignore_index=True)
        source_kind = "runtime" if csv_path == DB_CSV else "seed" if csv_path == SEED_DB_CSV else "extra"
        print(f"✅ {csv_path.name} ({source_kind}): +{len(extra)} rows")

print(f"\n📊 Dataset: {len(dataset)} samples")
print(dataset["label"].value_counts().to_string())

# drop under-represented classes
counts = dataset["label"].value_counts()
valid  = counts[counts >= MIN_SAMPLES].index
dataset = dataset[dataset["label"].isin(valid)]
print(f"\n✅ After filter (>= {MIN_SAMPLES} samples): {len(dataset)} rows, {dataset['label'].nunique()} classes")

# ── Pipeline ────────────────────────────────────────────────────────────────
pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        analyzer    = "word",
        ngram_range = (1, 3),     # unigrams + bigrams + trigrams
        min_df      = 2,          # ignore very rare terms
        max_features= 20_000,
        sublinear_tf= True,       # log(1+tf) — helps with Arabic repetition
    )),
    ("clf", LogisticRegression(
        max_iter    = 1000,
        C           = 5.0,
        class_weight= "balanced", # handles imbalanced classes
        solver      = "lbfgs",
    )),
])

# ── Cross-validation ────────────────────────────────────────────────────────
print("\n⏳ Running 5-fold cross-validation ...")
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipeline, dataset["text"], dataset["label"],
                         cv=cv, scoring="accuracy", n_jobs=-1)

print(f"\n{'─'*50}")
print(f"📈 CV Accuracy: {scores.mean():.1%} ± {scores.std():.1%}")
print(f"   Folds: {[f'{s:.1%}' for s in scores]}")

# ── Train on full dataset + detailed report ─────────────────────────────────
print("\n⏳ Training on full dataset ...")
pipeline.fit(dataset["text"], dataset["label"])

preds = pipeline.predict(dataset["text"])
print("\n📋 Classification report (train set):")
print(classification_report(dataset["label"], preds, digits=3))

# ── Save model ──────────────────────────────────────────────────────────────
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
tmp_path: pathlib.Path | None = None
try:
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=RUNTIME_DIR,
        prefix="model.",
        suffix=".tmp",
        delete=False,
    ) as tmp:
        pickle.dump({
            "pipeline": pipeline,
            "classes":  list(pipeline.classes_),
        }, tmp)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = pathlib.Path(tmp.name)

    os.replace(tmp_path, MODEL_PATH)
finally:
    if tmp_path is not None and tmp_path.exists():
        tmp_path.unlink(missing_ok=True)

print(f"\n✅ Model saved atomically → {MODEL_PATH}")
print(f"   Classes: {list(pipeline.classes_)}")
