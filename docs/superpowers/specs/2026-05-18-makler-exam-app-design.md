# Makler Exam App — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

## Overview

Standalone mobile-first web application for studying and self-testing knowledge required for the Polish stockbroker (makler giełdowy) license exam. Separate project from StocksTracker. Single user, password-protected. Deploy on Render.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Flask (Python) |
| Database | SQLite |
| Deploy | Render (web service) |
| Theme | Dark, mobile-first |

## Project Structure

```
makler-exam-app/
├── backend/
│   ├── server.py
│   ├── database.db
│   └── data/
│       ├── questions/        # JSON files, one per category
│       └── materials/        # Markdown files, one per chapter
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Materials.jsx
│   │   │   ├── Quiz.jsx
│   │   │   ├── QuizSession.jsx
│   │   │   └── Progress.jsx
│   │   ├── components/
│   │   └── App.jsx
│   └── package.json
├── Procfile
├── render.yaml
└── requirements.txt
```

## Authentication

- Single user, no registration
- Password stored as bcrypt hash in environment variable on Render (`APP_PASSWORD_HASH`)
- `POST /api/login` validates password, returns JWT token (24h expiry)
- Token stored in localStorage, sent as `Authorization: Bearer` header
- All API routes protected except `/api/login`

## Navigation

Bottom navigation bar (mobile) with 3 tabs:
- 📚 **Materiały** — study materials
- ✍️ **Quiz** — quiz/exam mode
- 📊 **Postęp** — progress & stats

## Screens

### Login
Single password field, submit button, dark background. On success redirects to Quiz tab.

### Materiały (Study Materials)
- List view: cards per chapter/topic (e.g. "Rachunkowość", "Prawo rynku kapitałowego")
- Chapter view: rendered Markdown content, prev/next chapter navigation at bottom
- Content sourced from `backend/data/materials/*.md`

### Quiz — Start Screen
Two large buttons:
- **Tryb nauki** — immediate feedback after each answer
- **Tryb egzaminu** — no feedback until end

Pre-quiz filters (always shown on start screen, before mode selection):
- Category selector: "Wszystkie" or specific category
- Question count: slider or picker (default: all available)

### Quiz — Question View (Layout A)

```
[ 1 ]          00:12:34          [ ! ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ (progress bar)

Treść pytania...

○ Opcja A
○ Opcja B (selected → green border + filled circle)
○ Opcja C
○ Opcja D

[ ‹ WSTECZ ]              [ DALEJ › ]
           [ POMIŃ ]

✓ 3 poprawne  → 2 pominięte  ✗ 1 błędna
```

Timer starts immediately when the first question loads and counts up.

**Tryb nauki behavior:** After selecting an option:
- Correct: option turns green, brief "Poprawnie! ✓" flash, auto-advance after 1.5s
- Incorrect: selected option turns red, correct option turns green, explanation shown below, user taps DALEJ to continue

**Tryb egzaminu behavior:** Options are selectable but no color feedback. After completing all questions, show results screen.

### Quiz — Results Screen
- Score: X/Y correct (percentage)
- Time taken
- Breakdown: correct / incorrect / skipped counts
- List of missed questions with correct answers and explanations
- Buttons: "Powtórz błędne" (starts new nauka-mode session with only incorrect questions) | "Wróć do menu"

### Postęp (Progress)
- Overall mastery % (rolling last 30 days)
- Per-category breakdown bar chart (simple CSS bars)
- Last 5 sessions: date, mode (nauka/egzamin), score, duration
- "Najsłabsze kategorie" highlight (bottom 2 categories by score)

## Data Model

### Questions JSON (`data/questions/<category>.json`)
```json
[
  {
    "id": 1,
    "category": "rachunkowosc",
    "question": "Zgodnie z rozporządzeniem Ministra Finansów...",
    "options": [
      "Akcje i udziały w jednostkach podporządkowanych wycenia się metodą praw własności",
      "Aktywa finansowe przeznaczone do obrotu wycenia się według wartości rynkowej...",
      "Aktywa finansowe utrzymywane do terminu zapadalności wycenia się według wartości godziwej",
      "Aktywa finansowe dostępne do sprzedaży wycenia się według zamortyzowanego kosztu"
    ],
    "correct": 1,
    "explanation": "Zgodnie z rozporządzeniem, aktywa przeznaczone do obrotu..."
  }
]
```

### Materials (`data/materials/<chapter>.md`)
Plain Markdown with headings and paragraphs. Filename becomes the chapter title (slugified).

### SQLite Schema

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  started_at TEXT,
  finished_at TEXT,
  mode TEXT,           -- 'nauka' | 'egzamin'
  category TEXT,       -- NULL = all categories
  total INTEGER,
  correct INTEGER,
  incorrect INTEGER,
  skipped INTEGER
);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  question_id INTEGER,
  selected INTEGER,    -- index of chosen option, NULL if skipped
  is_correct INTEGER   -- 0 or 1
);
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/login` | Validate password, return JWT |
| GET | `/api/questions` | All questions (optional `?category=`) |
| GET | `/api/materials` | List of chapters (id, title) |
| GET | `/api/materials/<id>` | Chapter content (Markdown as string) |
| POST | `/api/sessions` | Save completed session + answers |
| GET | `/api/stats` | Aggregated progress stats |

## Mobile-First Design Constraints

- Minimum tap target: 48px height
- Font size: minimum 14px for question text, 13px for options
- No horizontal scroll
- Bottom navigation (not hamburger menu)
- Timer uses tabular-nums font variant (no layout shift)
- All buttons full-width or paired full-width on mobile

## Content Import Workflow

Questions come from PDF exam materials provided by the user. Workflow:
1. User pastes or uploads PDF content in conversation
2. Claude parses and writes structured JSON to `data/questions/<category>.json`
3. Redeploy on Render (or hot-reload if running locally)

No admin UI needed — content is managed via conversation with Claude.

## Deployment (Render)

- **Service type:** Web Service
- **Build command:** `cd frontend && npm install && npm run build`
- **Start command:** `gunicorn backend.server:app`
- **Environment variables:** `APP_PASSWORD_HASH`, `SECRET_KEY`, `DATABASE_URL` (optional, defaults to local SQLite)
- Static files served by Flask from `frontend/dist/`
