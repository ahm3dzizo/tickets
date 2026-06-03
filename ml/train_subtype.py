"""
ml/train_subtype.py
────────────────────
Trains per-type sub-type classifiers.
Currently covers: plumbing

Run:  python3 ml/train_subtype.py
"""

import re
import pickle
import pathlib
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

BASE_DIR = pathlib.Path(__file__).parent

# ── Arabic normalisation (same as classifier_service.py) ─────────────────────
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

# ── Configs: one entry per main type ─────────────────────────────────────────
SUBTYPE_CONFIGS = [
    {
        "type_key":   "plumbing",
        "csv":        BASE_DIR / "subtype_plumbing.csv",
        "model_out":  BASE_DIR / "model_subtype_plumbing.pkl",
        "min_samples": 5,
    },
]

for cfg in SUBTYPE_CONFIGS:
    print(f"\n{'═'*55}")
    print(f"  Training sub-type model for: {cfg['type_key']}")
    print(f"{'═'*55}")

    if not cfg["csv"].exists():
        print(f"  ⚠  CSV not found: {cfg['csv']} — skipping")
        continue

    # ── Load data ──────────────────────────────────────────────────────────────
    df = pd.read_csv(cfg["csv"])
    df = df.dropna(subset=["text", "label"])
    df["text"] = df["text"].apply(normalize)
    df = df[df["text"].str.len() >= 5]

    # Also pull from DB tickets that have confirmed sub-types
    db_csv = BASE_DIR / f"db_subtypes_{cfg['type_key']}.csv"
    if db_csv.exists():
        db = pd.read_csv(db_csv)
        db["text"] = db["text"].apply(normalize)
        db = db[db["text"].str.len() >= 5]
        df = pd.concat([df, db], ignore_index=True)
        print(f"  ✅ Added {len(db)} DB rows from {db_csv.name}")

    print(f"\n  📊 Dataset: {len(df)} samples")
    print(df["label"].value_counts().to_string())

    # Drop rare classes
    counts = df["label"].value_counts()
    valid  = counts[counts >= cfg["min_samples"]].index
    df = df[df["label"].isin(valid)]
    n_classes = df["label"].nunique()
    print(f"\n  ✅ After filter: {len(df)} rows, {n_classes} classes")

    if n_classes < 2:
        print("  ⚠  Need at least 2 classes — skipping")
        continue

    # ── Pipeline ───────────────────────────────────────────────────────────────
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            analyzer     = "word",
            ngram_range  = (1, 3),
            min_df       = 1,
            max_features = 5_000,
            sublinear_tf = True,
        )),
        ("clf", LogisticRegression(
            max_iter     = 1000,
            C            = 3.0,
            class_weight = "balanced",
            solver       = "lbfgs",
        )),
    ])

    # ── Cross-validation ───────────────────────────────────────────────────────
    if len(df) >= 10 and n_classes >= 2:
        n_splits = min(5, len(df) // n_classes)
        if n_splits >= 2:
            cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            scores = cross_val_score(pipeline, df["text"], df["label"],
                                     cv=cv, scoring="accuracy", n_jobs=-1)
            print(f"\n  📈 CV Accuracy: {scores.mean():.1%} ± {scores.std():.1%}")

    # ── Train on full data ─────────────────────────────────────────────────────
    pipeline.fit(df["text"], df["label"])

    # ── Save ───────────────────────────────────────────────────────────────────
    with open(cfg["model_out"], "wb") as f:
        pickle.dump({"pipeline": pipeline, "classes": list(pipeline.classes_)}, f)

    print(f"\n  ✅ Model saved → {cfg['model_out'].name}")
    print(f"     Classes: {list(pipeline.classes_)}")

print("\n✅ All sub-type models trained.")
