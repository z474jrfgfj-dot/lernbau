#!/usr/bin/env python3
"""Merge data/units/*.json into data/content.json and validate the schema.

Usage:  python3 tools/build_content.py
Invalid cards/questions are dropped with a warning so the app never sees broken data.
"""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

warnings = []


def warn(msg):
    warnings.append(msg)


def nonempty(v):
    return isinstance(v, str) and v.strip() != ""


def check_card(c, where):
    t = c.get("type")
    if t == "basic":
        return nonempty(c.get("front")) and nonempty(c.get("back")) or warn(f"{where}: basic ohne front/back")
    if t == "vocab":
        return nonempty(c.get("en")) and nonempty(c.get("de")) or warn(f"{where}: vocab ohne en/de")
    warn(f"{where}: unbekannter Kartentyp {t!r}")
    return False


def check_question(q, where):
    t = q.get("type")
    if not nonempty(q.get("question")):
        return warn(f"{where}: ohne question")
    if t == "mc":
        opts = q.get("options")
        a = q.get("answer")
        if not (isinstance(opts, list) and 2 <= len(opts) <= 6 and all(nonempty(o) for o in opts)):
            return warn(f"{where}: mc options ungültig")
        if not (isinstance(a, int) and 0 <= a < len(opts)):
            return warn(f"{where}: mc answer-Index ungültig")
        if len(set(o.strip().lower() for o in opts)) != len(opts):
            return warn(f"{where}: mc doppelte Optionen")
        return True
    if t == "input":
        if not nonempty(q.get("answer")):
            return warn(f"{where}: input ohne answer")
        acc = q.get("accept", [])
        if not isinstance(acc, list):
            return warn(f"{where}: accept ist keine Liste")
        return True
    if t == "numeric":
        a = q.get("answer")
        if not isinstance(a, (int, float)) or isinstance(a, bool):
            return warn(f"{where}: numeric answer ist keine Zahl")
        tol = q.get("tolerance", 0.02)
        if not isinstance(tol, (int, float)) or tol < 0 or tol > 0.5:
            return warn(f"{where}: tolerance ungültig")
        return True
    return warn(f"{where}: unbekannter Fragetyp {t!r}")


def main():
    subjects = json.loads((DATA / "subjects.json").read_text("utf-8"))
    subject_ids = {s["id"] for s in subjects}
    order = {s["id"]: i for i, s in enumerate(subjects)}
    decks, seen_ids = [], set()

    for f in sorted((DATA / "units").glob("*.json")):
        try:
            unit = json.loads(f.read_text("utf-8"))
        except json.JSONDecodeError as e:
            warn(f"{f.name}: ungültiges JSON ({e}) – übersprungen")
            continue
        subj = unit.get("subject")
        if subj not in subject_ids:
            warn(f"{f.name}: unbekanntes subject {subj!r} – übersprungen")
            continue
        for d in unit.get("decks", []):
            did = d.get("id", "")
            if not ID_RE.match(did) or did in seen_ids:
                warn(f"{f.name}: Deck-ID {did!r} ungültig oder doppelt – übersprungen")
                continue
            seen_ids.add(did)
            cards, quiz = [], []
            for c in d.get("cards", []):
                cid = c.get("id", "")
                where = f"{f.name}:{cid}"
                if not ID_RE.match(cid) or cid in seen_ids:
                    warn(f"{where}: ID ungültig oder doppelt")
                    continue
                if check_card(c, where):
                    seen_ids.add(cid)
                    cards.append(c)
            for q in d.get("quiz", []):
                qid = q.get("id", "")
                where = f"{f.name}:{qid}"
                if not ID_RE.match(qid) or qid in seen_ids:
                    warn(f"{where}: ID ungültig oder doppelt")
                    continue
                if check_question(q, where):
                    seen_ids.add(qid)
                    quiz.append(q)
            if not cards and not quiz:
                warn(f"{f.name}: Deck {did} ist leer – übersprungen")
                continue
            decks.append({
                "id": did,
                "subject": subj,
                "unit": unit.get("unit", f.stem),
                "title": d.get("title", did),
                "description": d.get("description", ""),
                "sources": d.get("sources", []),
                "cards": cards,
                "quiz": quiz,
            })

    decks.sort(key=lambda d: (order[d["subject"]], d["unit"]))
    body = json.dumps({"subjects": subjects, "decks": decks}, ensure_ascii=False, sort_keys=True)
    version = hashlib.sha1(body.encode()).hexdigest()[:10]
    exams = []
    exams_file = DATA / "exams.json"
    if exams_file.exists():
        for e in json.loads(exams_file.read_text("utf-8")):
            if not (nonempty(e.get("id")) and nonempty(e.get("title")) and re.match(r"^\d{4}-\d{2}-\d{2}$", e.get("date", ""))):
                warn(f"exams.json: ungültiger Termin {e!r}")
                continue
            exams.append(e)
    body += json.dumps(exams, ensure_ascii=False, sort_keys=True)
    version = hashlib.sha1(body.encode()).hexdigest()[:10]
    out = {
        "version": version,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "subjects": subjects,
        "decks": decks,
        "exams": exams,
    }
    (DATA / "content.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")

    n_cards = sum(len(d["cards"]) for d in decks)
    n_quiz = sum(len(d["quiz"]) for d in decks)
    print(f"content.json {version}: {len(decks)} Decks, {n_cards} Karten, {n_quiz} Fragen")
    for s in subjects:
        ds = [d for d in decks if d["subject"] == s["id"]]
        if ds:
            print(f"  {s['name']:<16} {len(ds):>3} Decks {sum(len(d['cards']) for d in ds):>5} Karten {sum(len(d['quiz']) for d in ds):>5} Fragen")
    if warnings:
        print(f"\n{len(warnings)} Warnungen:")
        for w in warnings:
            print("  -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
