# Makler Exam App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first Polish stockbroker exam prep app with study materials, two quiz modes (nauka/egzamin), and persistent progress tracking.

**Architecture:** New standalone project at `~/Desktop/makler-exam-app/`. Flask serves both API and the built React app from `frontend/dist/`. SQLite stores session history. JWT auth protects all API routes.

**Tech Stack:** Python 3.11+, Flask, PyJWT, bcrypt, gunicorn, React 18, Vite, react-router-dom v6, marked (Markdown)

---

## File Map

```
~/Desktop/makler-exam-app/
├── backend/
│   ├── __init__.py            # empty
│   ├── server.py              # Flask app factory, static serving, route registration
│   ├── auth.py                # bcrypt verify, JWT create/verify, require_auth decorator
│   ├── db.py                  # SQLite connection, schema init
│   └── routes/
│       ├── __init__.py        # empty
│       ├── questions.py       # GET /api/questions
│       ├── materials.py       # GET /api/materials, GET /api/materials/<id>
│       └── sessions.py        # POST /api/sessions, GET /api/stats
├── backend/data/
│   ├── questions/
│   │   └── przyklad.json      # sample questions
│   └── materials/
│       └── przyklad.md        # sample chapter
├── tests/
│   ├── conftest.py            # Flask test client + auth token fixture
│   ├── test_auth.py
│   ├── test_questions.py
│   ├── test_materials.py
│   └── test_sessions.py
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── index.css          # dark theme CSS variables + global reset
│       ├── api.js             # fetch wrapper with JWT header
│       ├── App.jsx            # BrowserRouter, auth guard, BottomNav, Routes
│       ├── components/
│       │   └── BottomNav.jsx
│       └── pages/
│           ├── Login.jsx
│           ├── Materials.jsx       # chapter list
│           ├── MaterialChapter.jsx # chapter reader (Markdown)
│           ├── Quiz.jsx            # start screen: filters + mode buttons
│           ├── QuizSession.jsx     # active quiz: question, timer, navigation
│           ├── QuizResults.jsx     # results after session
│           └── Progress.jsx        # stats, category breakdown, history
├── .gitignore
├── Procfile
├── render.yaml
└── requirements.txt
```

---

## Task 1: Project scaffold

**Files:**
- Create: `~/Desktop/makler-exam-app/` (entire directory tree)
- Create: `requirements.txt`
- Create: `.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ~/Desktop/makler-exam-app/{backend/routes,backend/data/questions,backend/data/materials,tests,frontend/src/{pages,components}}
cd ~/Desktop/makler-exam-app
touch backend/__init__.py backend/routes/__init__.py
```

- [ ] **Step 2: Create requirements.txt**

```
flask==3.0.3
PyJWT==2.8.0
bcrypt==4.1.3
flask-cors==4.0.1
gunicorn==22.0.0
pytest==8.2.0
```

- [ ] **Step 3: Create .gitignore**

```
__pycache__/
*.pyc
*.db
.env
frontend/node_modules/
frontend/dist/
.DS_Store
```

- [ ] **Step 4: Initialize git and install Python deps**

```bash
cd ~/Desktop/makler-exam-app
git init
pip install -r requirements.txt
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: project scaffold"
```

---

## Task 2: Database — db.py

**Files:**
- Create: `backend/db.py`

- [ ] **Step 1: Write db.py**

```python
import sqlite3
import os

DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), 'database.db'))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY,
            started_at TEXT NOT NULL,
            finished_at TEXT NOT NULL,
            mode TEXT NOT NULL,
            category TEXT,
            total INTEGER NOT NULL,
            correct INTEGER NOT NULL,
            incorrect INTEGER NOT NULL,
            skipped INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY,
            session_id INTEGER NOT NULL REFERENCES sessions(id),
            question_id INTEGER NOT NULL,
            selected INTEGER,
            is_correct INTEGER NOT NULL
        );
    """)
    conn.commit()
    conn.close()
```

- [ ] **Step 2: Verify schema creates without error**

```bash
cd ~/Desktop/makler-exam-app
python -c "from backend.db import init_db; init_db(); print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/db.py
git commit -m "feat: SQLite schema (sessions, answers)"
```

---

## Task 3: Auth — auth.py

**Files:**
- Create: `backend/auth.py`

- [ ] **Step 1: Write auth.py**

```python
import jwt
import bcrypt
import datetime
import os
from functools import wraps
from flask import request, jsonify, current_app

def create_token(secret_key: str) -> str:
    payload = {
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24),
        'iat': datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, secret_key, algorithm='HS256')

def verify_token(token: str, secret_key: str) -> bool:
    try:
        jwt.decode(token, secret_key, algorithms=['HS256'])
        return True
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return False

def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        token = header[7:]
        if not verify_token(token, current_app.config['SECRET_KEY']):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated
```

- [ ] **Step 2: Generate a bcrypt hash for your password (run once, save the output)**

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'TWOJE_HASLO', bcrypt.gensalt()).decode())"
```

Save the printed hash — you'll need it as the `APP_PASSWORD_HASH` environment variable.

- [ ] **Step 3: Commit**

```bash
git add backend/auth.py
git commit -m "feat: auth — bcrypt verify, JWT create/verify, require_auth decorator"
```

---

## Task 4: Flask server + login endpoint + test setup

**Files:**
- Create: `backend/server.py`
- Create: `tests/conftest.py`
- Create: `tests/test_auth.py`

- [ ] **Step 1: Write backend/server.py**

```python
import os
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from backend.db import init_db
from backend.auth import check_password, create_token, require_auth
from backend.routes.questions import questions_bp
from backend.routes.materials import materials_bp
from backend.routes.sessions import sessions_bp

def create_app():
    app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    app.config['APP_PASSWORD_HASH'] = os.environ.get('APP_PASSWORD_HASH', '')

    CORS(app, resources={r'/api/*': {'origins': '*'}})

    with app.app_context():
        init_db()

    app.register_blueprint(questions_bp)
    app.register_blueprint(materials_bp)
    app.register_blueprint(sessions_bp)

    @app.route('/api/login', methods=['POST'])
    def login():
        data = request.get_json(silent=True) or {}
        password = data.get('password', '')
        pw_hash = app.config['APP_PASSWORD_HASH']
        if not pw_hash or not check_password(password, pw_hash):
            return jsonify({'error': 'Invalid password'}), 401
        token = create_token(app.config['SECRET_KEY'])
        return jsonify({'token': token})

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/'):
            return jsonify({'error': 'Not found'}), 404
        dist = app.static_folder
        if dist and os.path.exists(os.path.join(dist, path)):
            return send_from_directory(dist, path)
        return send_from_directory(dist, 'index.html')

    return app

app = create_app()
```

- [ ] **Step 2: Write tests/conftest.py**

```python
import pytest
import bcrypt
from backend.server import create_app

TEST_PASSWORD = 'testpassword123'
TEST_HASH = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()

@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    app.config['APP_PASSWORD_HASH'] = TEST_HASH
    app.config['SECRET_KEY'] = 'test-secret'
    with app.test_client() as c:
        yield c

@pytest.fixture
def auth_token(client):
    resp = client.post('/api/login', json={'password': TEST_PASSWORD})
    return resp.get_json()['token']

@pytest.fixture
def auth_headers(auth_token):
    return {'Authorization': f'Bearer {auth_token}'}
```

- [ ] **Step 3: Write tests/test_auth.py**

```python
def test_login_correct_password(client):
    resp = client.post('/api/login', json={'password': 'testpassword123'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'token' in data
    assert len(data['token']) > 10

def test_login_wrong_password(client):
    resp = client.post('/api/login', json={'password': 'wrong'})
    assert resp.status_code == 401

def test_login_missing_password(client):
    resp = client.post('/api/login', json={})
    assert resp.status_code == 401

def test_protected_route_without_token(client):
    resp = client.get('/api/questions')
    assert resp.status_code == 401

def test_protected_route_with_token(client, auth_headers):
    resp = client.get('/api/questions', headers=auth_headers)
    assert resp.status_code == 200
```

- [ ] **Step 4: Create stub blueprints so server.py imports work**

Create `backend/routes/questions.py`:
```python
from flask import Blueprint, jsonify
from backend.auth import require_auth

questions_bp = Blueprint('questions', __name__)

@questions_bp.route('/api/questions')
@require_auth
def get_questions():
    return jsonify([])
```

Create `backend/routes/materials.py`:
```python
from flask import Blueprint, jsonify
from backend.auth import require_auth

materials_bp = Blueprint('materials', __name__)

@materials_bp.route('/api/materials')
@require_auth
def list_materials():
    return jsonify([])

@materials_bp.route('/api/materials/<int:chapter_id>')
@require_auth
def get_material(chapter_id):
    return jsonify({'content': ''})
```

Create `backend/routes/sessions.py`:
```python
from flask import Blueprint, jsonify
from backend.auth import require_auth

sessions_bp = Blueprint('sessions', __name__)

@sessions_bp.route('/api/sessions', methods=['POST'])
@require_auth
def save_session():
    return jsonify({'id': 0})

@sessions_bp.route('/api/stats')
@require_auth
def get_stats():
    return jsonify({})
```

- [ ] **Step 5: Run tests**

```bash
cd ~/Desktop/makler-exam-app
python -m pytest tests/test_auth.py -v
```

Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/routes/ tests/
git commit -m "feat: Flask app, login endpoint, auth tests"
```

---

## Task 5: Questions API

**Files:**
- Modify: `backend/routes/questions.py`
- Create: `tests/test_questions.py`
- Create: `backend/data/questions/przyklad.json` (sample data)

- [ ] **Step 1: Create sample questions file** (`backend/data/questions/przyklad.json`)

```json
[
  {
    "id": 1,
    "category": "przyklad",
    "question": "Które z poniższych twierdzeń jest prawdziwe?",
    "options": [
      "Opcja A — nieprawidłowa",
      "Opcja B — prawidłowa",
      "Opcja C — nieprawidłowa",
      "Opcja D — nieprawidłowa"
    ],
    "correct": 1,
    "explanation": "Opcja B jest prawidłowa, ponieważ..."
  },
  {
    "id": 2,
    "category": "przyklad",
    "question": "Drugie przykładowe pytanie?",
    "options": [
      "Tak",
      "Nie",
      "Może",
      "Nie wiem"
    ],
    "correct": 0,
    "explanation": "Poprawna odpowiedź to Tak."
  }
]
```

- [ ] **Step 2: Write tests/test_questions.py**

```python
def test_get_all_questions(client, auth_headers):
    resp = client.get('/api/questions', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert len(data) >= 2
    q = data[0]
    assert 'id' in q
    assert 'question' in q
    assert 'options' in q
    assert 'correct' in q
    assert 'explanation' in q
    assert 'category' in q

def test_get_questions_by_category(client, auth_headers):
    resp = client.get('/api/questions?category=przyklad', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert all(q['category'] == 'przyklad' for q in data)

def test_get_questions_unknown_category(client, auth_headers):
    resp = client.get('/api/questions?category=nieznana', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == []
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
python -m pytest tests/test_questions.py -v
```

Expected: FAILED (returns empty list)

- [ ] **Step 4: Implement backend/routes/questions.py**

```python
import os
import json
from flask import Blueprint, jsonify, request
from backend.auth import require_auth

questions_bp = Blueprint('questions', __name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'questions')

def load_all_questions():
    questions = []
    if not os.path.isdir(DATA_DIR):
        return questions
    for filename in sorted(os.listdir(DATA_DIR)):
        if filename.endswith('.json'):
            path = os.path.join(DATA_DIR, filename)
            with open(path, encoding='utf-8') as f:
                questions.extend(json.load(f))
    return questions

@questions_bp.route('/api/questions')
@require_auth
def get_questions():
    category = request.args.get('category')
    questions = load_all_questions()
    if category:
        questions = [q for q in questions if q.get('category') == category]
    return jsonify(questions)
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
python -m pytest tests/test_questions.py -v
```

Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add backend/routes/questions.py backend/data/questions/przyklad.json tests/test_questions.py
git commit -m "feat: GET /api/questions with optional category filter"
```

---

## Task 6: Materials API

**Files:**
- Modify: `backend/routes/materials.py`
- Create: `backend/data/materials/przyklad.md`
- Create: `tests/test_materials.py`

- [ ] **Step 1: Create sample materials file** (`backend/data/materials/przyklad.md`)

```markdown
# Przykładowy Rozdział

## Wstęp

To jest przykładowy materiał do nauki na licencję maklera giełdowego.

## Podstawowe pojęcia

**Akcja** — papier wartościowy reprezentujący udział w kapitale spółki akcyjnej.

**Obligacja** — dłużny papier wartościowy, w którym emitent zobowiązuje się do zwrotu pożyczonej kwoty wraz z odsetkami.

## Podsumowanie

Zapamiętaj kluczowe różnice między akcjami a obligacjami.
```

- [ ] **Step 2: Write tests/test_materials.py**

```python
def test_list_materials(client, auth_headers):
    resp = client.get('/api/materials', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert len(data) >= 1
    chapter = data[0]
    assert 'id' in chapter
    assert 'title' in chapter

def test_get_material_content(client, auth_headers):
    chapters = client.get('/api/materials', headers=auth_headers).get_json()
    chapter_id = chapters[0]['id']
    resp = client.get(f'/api/materials/{chapter_id}', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'content' in data
    assert len(data['content']) > 0

def test_get_material_not_found(client, auth_headers):
    resp = client.get('/api/materials/9999', headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
python -m pytest tests/test_materials.py -v
```

Expected: FAILED

- [ ] **Step 4: Implement backend/routes/materials.py**

```python
import os
from flask import Blueprint, jsonify
from backend.auth import require_auth

materials_bp = Blueprint('materials', __name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'materials')

def _slugify(name: str) -> str:
    return name.replace('_', ' ').replace('-', ' ').title()

def list_chapters():
    chapters = []
    if not os.path.isdir(DATA_DIR):
        return chapters
    for idx, filename in enumerate(sorted(os.listdir(DATA_DIR)), start=1):
        if filename.endswith('.md'):
            title = _slugify(filename[:-3])
            chapters.append({'id': idx, 'filename': filename, 'title': title})
    return chapters

@materials_bp.route('/api/materials')
@require_auth
def list_materials():
    return jsonify([{'id': c['id'], 'title': c['title']} for c in list_chapters()])

@materials_bp.route('/api/materials/<int:chapter_id>')
@require_auth
def get_material(chapter_id):
    chapters = list_chapters()
    chapter = next((c for c in chapters if c['id'] == chapter_id), None)
    if not chapter:
        return jsonify({'error': 'Not found'}), 404
    path = os.path.join(DATA_DIR, chapter['filename'])
    with open(path, encoding='utf-8') as f:
        content = f.read()
    return jsonify({'id': chapter_id, 'title': chapter['title'], 'content': content})
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
python -m pytest tests/test_materials.py -v
```

Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add backend/routes/materials.py backend/data/materials/przyklad.md tests/test_materials.py
git commit -m "feat: GET /api/materials list and chapter content"
```

---

## Task 7: Sessions + Stats API

**Files:**
- Modify: `backend/routes/sessions.py`
- Create: `tests/test_sessions.py`

- [ ] **Step 1: Write tests/test_sessions.py**

```python
import json

SESSION_PAYLOAD = {
    'started_at': '2026-05-18T10:00:00',
    'finished_at': '2026-05-18T10:15:00',
    'mode': 'nauka',
    'category': None,
    'total': 3,
    'correct': 2,
    'incorrect': 1,
    'skipped': 0,
    'answers': [
        {'question_id': 1, 'selected': 1, 'is_correct': True},
        {'question_id': 2, 'selected': 0, 'is_correct': True},
        {'question_id': 3, 'selected': 2, 'is_correct': False},
    ]
}

def test_save_session(client, auth_headers):
    resp = client.post('/api/sessions', headers=auth_headers,
                       json=SESSION_PAYLOAD)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'id' in data
    assert data['id'] > 0

def test_get_stats_after_session(client, auth_headers):
    client.post('/api/sessions', headers=auth_headers, json=SESSION_PAYLOAD)
    resp = client.get('/api/stats', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'overall_pct' in data
    assert 'recent_sessions' in data
    assert 'by_category' in data
    assert isinstance(data['recent_sessions'], list)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_sessions.py -v
```

Expected: FAILED

- [ ] **Step 3: Implement backend/routes/sessions.py**

```python
from flask import Blueprint, jsonify, request
from backend.auth import require_auth
from backend.db import get_db

sessions_bp = Blueprint('sessions', __name__)

@sessions_bp.route('/api/sessions', methods=['POST'])
@require_auth
def save_session():
    data = request.get_json(silent=True) or {}
    db = get_db()
    cur = db.execute(
        """INSERT INTO sessions (started_at, finished_at, mode, category,
           total, correct, incorrect, skipped)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.get('started_at'), data.get('finished_at'), data.get('mode'),
         data.get('category'), data.get('total', 0), data.get('correct', 0),
         data.get('incorrect', 0), data.get('skipped', 0))
    )
    session_id = cur.lastrowid
    for ans in data.get('answers', []):
        db.execute(
            "INSERT INTO answers (session_id, question_id, selected, is_correct) VALUES (?, ?, ?, ?)",
            (session_id, ans['question_id'], ans.get('selected'), int(ans.get('is_correct', False)))
        )
    db.commit()
    db.close()
    return jsonify({'id': session_id})

@sessions_bp.route('/api/stats')
@require_auth
def get_stats():
    db = get_db()

    # Overall mastery: % correct from last 30 days
    row = db.execute(
        """SELECT SUM(correct) as c, SUM(total) as t FROM sessions
           WHERE finished_at >= datetime('now', '-30 days')"""
    ).fetchone()
    total = row['t'] or 0
    correct = row['c'] or 0
    overall_pct = round(correct / total * 100) if total > 0 else 0

    # Last 5 sessions
    rows = db.execute(
        """SELECT id, started_at, finished_at, mode, category, total, correct, skipped
           FROM sessions ORDER BY id DESC LIMIT 5"""
    ).fetchall()
    recent_sessions = [dict(r) for r in rows]

    # Per-category stats (last 30 days)
    cat_rows = db.execute(
        """SELECT category, SUM(correct) as correct, SUM(total) as total
           FROM sessions
           WHERE finished_at >= datetime('now', '-30 days') AND category IS NOT NULL
           GROUP BY category"""
    ).fetchall()
    by_category = [
        {'category': r['category'],
         'correct': r['correct'],
         'total': r['total'],
         'pct': round(r['correct'] / r['total'] * 100) if r['total'] > 0 else 0}
        for r in cat_rows
    ]

    db.close()
    return jsonify({
        'overall_pct': overall_pct,
        'recent_sessions': recent_sessions,
        'by_category': by_category,
    })
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
python -m pytest tests/test_sessions.py -v
```

Expected: 2 passed

- [ ] **Step 5: Run all backend tests**

```bash
python -m pytest tests/ -v
```

Expected: all 13 tests passed

- [ ] **Step 6: Commit**

```bash
git add backend/routes/sessions.py tests/test_sessions.py
git commit -m "feat: POST /api/sessions, GET /api/stats"
```

---

## Task 8: Frontend scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Initialize frontend**

```bash
cd ~/Desktop/makler-exam-app/frontend
npm create vite@latest . -- --template react
# When prompted: select "React" and "JavaScript"
npm install
npm install react-router-dom marked
```

- [ ] **Step 2: Update vite.config.js** (add API proxy for dev)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
```

- [ ] **Step 3: Replace frontend/src/index.css with dark theme**

```css
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --border: #334155;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --text-dim: #64748b;
  --green: #22c55e;
  --red: #ef4444;
  --nav-h: 60px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 16px;
  min-height: 100dvh;
  -webkit-tap-highlight-color: transparent;
}

#root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

button {
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

a { color: inherit; text-decoration: none; }
```

- [ ] **Step 4: Replace frontend/src/main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Create stub App.jsx to verify dev server starts**

```jsx
export default function App() {
  return <div style={{padding: '2rem', color: 'white'}}>Makler Exam App</div>
}
```

- [ ] **Step 6: Verify dev server starts**

```bash
cd ~/Desktop/makler-exam-app/frontend
npm run dev
```

Open http://localhost:5173 — should show "Makler Exam App" on dark background.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/makler-exam-app
git add frontend/
git commit -m "feat: React + Vite frontend scaffold with dark theme"
```

---

## Task 9: API client — api.js

**Files:**
- Create: `frontend/src/api.js`

- [ ] **Step 1: Write frontend/src/api.js**

```js
const BASE = ''  // same origin in prod; proxy in dev

function getToken() {
  return localStorage.getItem('token')
}

async function apiFetch(path, options = {}) {
  const token = getToken()
  const resp = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (resp.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  return resp
}

export async function login(password) {
  const resp = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!resp.ok) throw new Error('Invalid password')
  const { token } = await resp.json()
  localStorage.setItem('token', token)
}

export function logout() {
  localStorage.removeItem('token')
}

export function isLoggedIn() {
  return Boolean(getToken())
}

export async function fetchQuestions(category) {
  const url = category ? `/api/questions?category=${category}` : '/api/questions'
  const resp = await apiFetch(url)
  return resp.json()
}

export async function fetchMaterials() {
  const resp = await apiFetch('/api/materials')
  return resp.json()
}

export async function fetchMaterial(id) {
  const resp = await apiFetch(`/api/materials/${id}`)
  return resp.json()
}

export async function saveSession(payload) {
  const resp = await apiFetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return resp.json()
}

export async function fetchStats() {
  const resp = await apiFetch('/api/stats')
  return resp.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: API client with JWT auth and all endpoints"
```

---

## Task 10: Login page + BottomNav + App shell

**Files:**
- Create: `frontend/src/pages/Login.jsx`
- Create: `frontend/src/components/BottomNav.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write frontend/src/pages/Login.jsx**

```jsx
import { useState } from 'react'
import { login } from '../api'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(password)
      onLogin()
    } catch {
      setError('Nieprawidłowe hasło')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', padding: '2rem', gap: '1.5rem'
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Makler Exam</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Wprowadź hasło aby kontynuować</p>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Hasło"
          autoFocus
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '14px 16px', color: 'var(--text)',
            fontSize: '1rem', width: '100%',
          }}
        />
        {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            background: 'var(--green)', color: '#0f172a', fontWeight: 700,
            borderRadius: '10px', padding: '14px', fontSize: '1rem',
            opacity: loading || !password ? 0.5 : 1,
          }}
        >
          {loading ? 'Logowanie...' : 'Zaloguj'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write frontend/src/components/BottomNav.jsx**

```jsx
import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/materials', icon: '📚', label: 'Materiały' },
  { to: '/quiz', icon: '✍️', label: 'Quiz' },
  { to: '/progress', icon: '📊', label: 'Postęp' },
]

export default function BottomNav() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'var(--nav-h)', background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'stretch',
      zIndex: 100,
    }}>
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          style={({ isActive }) => ({
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '2px', fontSize: '0.65rem', fontWeight: 600,
            color: isActive ? 'var(--green)' : 'var(--text-muted)',
            textDecoration: 'none',
          })}
        >
          <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Write frontend/src/App.jsx**

```jsx
import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isLoggedIn } from './api'
import Login from './pages/Login'
import Materials from './pages/Materials'
import MaterialChapter from './pages/MaterialChapter'
import Quiz from './pages/Quiz'
import QuizSession from './pages/QuizSession'
import QuizResults from './pages/QuizResults'
import Progress from './pages/Progress'
import BottomNav from './components/BottomNav'

function AppShell() {
  return (
    <>
      <div style={{ paddingBottom: 'var(--nav-h)', flex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/quiz" replace />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/materials/:id" element={<MaterialChapter />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/quiz/session" element={<QuizSession />} />
          <Route path="/quiz/results" element={<QuizResults />} />
          <Route path="/progress" element={<Progress />} />
        </Routes>
      </div>
      <BottomNav />
    </>
  )
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />
  }

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Create stub pages so App.jsx compiles**

Create each of these with minimal content:

`frontend/src/pages/Materials.jsx`:
```jsx
export default function Materials() { return <div style={{padding:'1rem'}}>Materiały</div> }
```

`frontend/src/pages/MaterialChapter.jsx`:
```jsx
export default function MaterialChapter() { return <div style={{padding:'1rem'}}>Rozdział</div> }
```

`frontend/src/pages/Quiz.jsx`:
```jsx
export default function Quiz() { return <div style={{padding:'1rem'}}>Quiz</div> }
```

`frontend/src/pages/QuizSession.jsx`:
```jsx
export default function QuizSession() { return <div style={{padding:'1rem'}}>Sesja</div> }
```

`frontend/src/pages/QuizResults.jsx`:
```jsx
export default function QuizResults() { return <div style={{padding:'1rem'}}>Wyniki</div> }
```

`frontend/src/pages/Progress.jsx`:
```jsx
export default function Progress() { return <div style={{padding:'1rem'}}>Postęp</div> }
```

- [ ] **Step 5: Start both servers and verify login works end-to-end**

Terminal 1 (backend):
```bash
cd ~/Desktop/makler-exam-app
APP_PASSWORD_HASH='<hash from Task 3>' SECRET_KEY='dev' python -m flask --app backend.server run --port 5000
```

Terminal 2 (frontend):
```bash
cd ~/Desktop/makler-exam-app/frontend
npm run dev
```

Open http://localhost:5173 — should show login screen. Enter password → should reach quiz stub with bottom nav.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: app shell, login, bottom nav, page stubs"
```

---

## Task 11: Materials list page

**Files:**
- Modify: `frontend/src/pages/Materials.jsx`

- [ ] **Step 1: Implement Materials.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMaterials } from '../api'

export default function Materials() {
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchMaterials().then(data => { setChapters(data); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Ładowanie...</div>

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Materiały do nauki</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {chapters.map(ch => (
          <button
            key={ch.id}
            onClick={() => navigate(`/materials/${ch.id}`)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '1rem 1.25rem',
              textAlign: 'left', color: 'var(--text)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              minHeight: '60px',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ch.title}</span>
            <span style={{ color: 'var(--text-dim)' }}>›</span>
          </button>
        ))}
        {chapters.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Brak materiałów.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to Materiały tab — should show "Przykładowy Rozdział" card. Tapping it navigates to `/materials/1` (stub page).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Materials.jsx
git commit -m "feat: materials list page"
```

---

## Task 12: Material chapter reader

**Files:**
- Modify: `frontend/src/pages/MaterialChapter.jsx`

- [ ] **Step 1: Implement MaterialChapter.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import { fetchMaterials, fetchMaterial } from '../api'

export default function MaterialChapter() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [chapter, setChapter] = useState(null)
  const [allChapters, setAllChapters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchMaterial(Number(id)), fetchMaterials()])
      .then(([ch, all]) => { setChapter(ch); setAllChapters(all); setLoading(false) })
  }, [id])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Ładowanie...</div>
  if (!chapter) return <div style={{ padding: '2rem', color: 'var(--red)' }}>Nie znaleziono rozdziału.</div>

  const currentIdx = allChapters.findIndex(c => c.id === chapter.id)
  const prevChapter = allChapters[currentIdx - 1]
  const nextChapter = allChapters[currentIdx + 1]

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/materials')}
        style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}
      >
        ‹ Wróć do listy
      </button>

      <div
        style={{ padding: '0 1rem 1rem' }}
        dangerouslySetInnerHTML={{ __html: marked.parse(chapter.content) }}
        className="md-content"
      />

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
        padding: '1rem', borderTop: '1px solid var(--border)',
      }}>
        <button
          onClick={() => prevChapter && navigate(`/materials/${prevChapter.id}`)}
          disabled={!prevChapter}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px', fontSize: '0.85rem',
            color: prevChapter ? 'var(--text)' : 'var(--text-dim)',
          }}
        >
          ‹ Poprzedni
        </button>
        <button
          onClick={() => nextChapter && navigate(`/materials/${nextChapter.id}`)}
          disabled={!nextChapter}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px', fontSize: '0.85rem',
            color: nextChapter ? 'var(--text)' : 'var(--text-dim)',
          }}
        >
          Następny ›
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add Markdown content styles to index.css**

Append to `frontend/src/index.css`:
```css
.md-content h1, .md-content h2, .md-content h3 {
  margin: 1.5rem 0 0.5rem;
  font-weight: 700;
  line-height: 1.3;
}
.md-content h1 { font-size: 1.3rem; }
.md-content h2 { font-size: 1.1rem; color: var(--green); }
.md-content h3 { font-size: 1rem; }
.md-content p { margin: 0.75rem 0; line-height: 1.7; color: var(--text); font-size: 0.95rem; }
.md-content strong { color: var(--text); font-weight: 700; }
.md-content ul, .md-content ol { padding-left: 1.5rem; margin: 0.75rem 0; }
.md-content li { margin: 0.4rem 0; line-height: 1.6; }
```

- [ ] **Step 3: Verify in browser**

Navigate to a chapter — should render Markdown as styled HTML with prev/next navigation.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/MaterialChapter.jsx frontend/src/index.css
git commit -m "feat: material chapter reader with Markdown rendering"
```

---

## Task 13: Quiz start screen

**Files:**
- Modify: `frontend/src/pages/Quiz.jsx`

- [ ] **Step 1: Implement Quiz.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchQuestions } from '../api'

export default function Quiz() {
  const navigate = useNavigate()
  const [allQuestions, setAllQuestions] = useState([])
  const [categories, setCategories] = useState([])
  const [category, setCategory] = useState('all')
  const [count, setCount] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchQuestions().then(qs => {
      setAllQuestions(qs)
      const cats = [...new Set(qs.map(q => q.category))]
      setCategories(cats)
      setCount(qs.length)
      setLoading(false)
    })
  }, [])

  const filtered = category === 'all'
    ? allQuestions
    : allQuestions.filter(q => q.category === category)

  const maxCount = filtered.length
  const actualCount = Math.min(count ?? maxCount, maxCount)

  function startQuiz(mode) {
    const selected = filtered.slice(0, actualCount)
    navigate('/quiz/session', { state: { questions: selected, mode } })
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Ładowanie...</div>

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Quiz</h2>

      {/* Category filter */}
      <div>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
          KATEGORIA
        </label>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setCount(null) }}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px', color: 'var(--text)', fontSize: '0.95rem',
          }}
        >
          <option value="all">Wszystkie ({allQuestions.length})</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat} ({allQuestions.filter(q => q.category === cat).length})
            </option>
          ))}
        </select>
      </div>

      {/* Count selector */}
      <div>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
          LICZBA PYTAŃ: {actualCount} / {maxCount}
        </label>
        <input
          type="range"
          min={1}
          max={maxCount}
          value={actualCount}
          onChange={e => setCount(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--green)' }}
        />
      </div>

      {/* Mode buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button
          onClick={() => startQuiz('nauka')}
          disabled={maxCount === 0}
          style={{
            background: 'var(--green)', color: '#0f172a', fontWeight: 700,
            borderRadius: '12px', padding: '16px', fontSize: '1rem',
          }}
        >
          📚 Tryb nauki
          <div style={{ fontSize: '0.75rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>
            Natychmiastowy feedback po każdej odpowiedzi
          </div>
        </button>
        <button
          onClick={() => startQuiz('egzamin')}
          disabled={maxCount === 0}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', fontWeight: 700,
            borderRadius: '12px', padding: '16px', fontSize: '1rem',
          }}
        >
          ✍️ Tryb egzaminu
          <div style={{ fontSize: '0.75rem', fontWeight: 400, marginTop: '2px', color: 'var(--text-muted)' }}>
            Wyniki i omówienie po zakończeniu
          </div>
        </button>
      </div>

      {maxCount === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
          Brak pytań dla wybranej kategorii.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to Quiz tab — should show category dropdown, question count slider, and two mode buttons.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Quiz.jsx
git commit -m "feat: quiz start screen with category filter and mode selection"
```

---

## Task 14: Quiz session — active question view

**Files:**
- Modify: `frontend/src/pages/QuizSession.jsx`

- [ ] **Step 1: Implement QuizSession.jsx**

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function QuizSession() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { questions = [], mode = 'nauka' } = state || {}

  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({}) // {id: {selected, isCorrect}}
  const [skipped, setSkipped] = useState(new Set())
  const [phase, setPhase] = useState('answering') // 'answering' | 'feedback'
  const [seconds, setSeconds] = useState(0)
  const startedAt = useRef(new Date().toISOString())
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  const current = questions[idx]
  const answered = answers[current?.id]
  const isAnswered = Boolean(answered)

  const correct = Object.values(answers).filter(a => a.isCorrect).length
  const incorrect = Object.values(answers).filter(a => !a.isCorrect).length

  function selectOption(optIdx) {
    if (isAnswered) return
    const isCorrect = optIdx === current.correct
    const newAnswers = { ...answers, [current.id]: { selected: optIdx, isCorrect } }
    setAnswers(newAnswers)
    setSkipped(prev => { const s = new Set(prev); s.delete(current.id); return s })

    if (mode === 'nauka') {
      setPhase('feedback')
      if (isCorrect) {
        setTimeout(() => { setPhase('answering'); goNext(newAnswers) }, 1500)
      }
    }
  }

  const goNext = useCallback((currentAnswers = answers) => {
    setPhase('answering')
    if (idx < questions.length - 1) {
      setIdx(i => i + 1)
    } else {
      finish(currentAnswers)
    }
  }, [idx, questions.length, answers])

  function goPrev() {
    setPhase('answering')
    if (idx > 0) setIdx(i => i - 1)
  }

  function skip() {
    setSkipped(prev => new Set(prev).add(current.id))
    if (idx < questions.length - 1) setIdx(i => i + 1)
    else finish()
  }

  function finish(finalAnswers = answers) {
    clearInterval(timerRef.current)
    const finishedAt = new Date().toISOString()
    const answeredCount = Object.keys(finalAnswers).length
    const correctCount = Object.values(finalAnswers).filter(a => a.isCorrect).length
    const incorrectCount = answeredCount - correctCount
    const skippedCount = questions.length - answeredCount

    const sessionPayload = {
      started_at: startedAt.current,
      finished_at: finishedAt,
      mode,
      category: null,
      total: questions.length,
      correct: correctCount,
      incorrect: incorrectCount,
      skipped: skippedCount,
      answers: questions.map(q => ({
        question_id: q.id,
        selected: finalAnswers[q.id]?.selected ?? null,
        is_correct: finalAnswers[q.id]?.isCorrect ?? false,
      })),
    }

    navigate('/quiz/results', {
      state: {
        questions,
        answers: finalAnswers,
        mode,
        seconds,
        sessionPayload,
      },
    })
  }

  if (!current) {
    return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Brak pytań.</div>
  }

  const progress = ((idx + 1) / questions.length) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - var(--nav-h))' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          background: 'var(--surface2)', borderRadius: '50%', width: '36px', height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '0.85rem',
        }}>
          {idx + 1}
        </div>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '1rem' }}>
          {formatTime(seconds)}
        </span>
        <button
          onClick={() => finish()}
          style={{
            background: 'var(--surface2)', borderRadius: '50%', width: '36px', height: '36px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
          }}
          title="Zakończ"
        >
          ⚑
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'var(--surface2)' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--green)', transition: 'width 0.3s' }} />
      </div>

      {/* Question */}
      <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text)' }}>
          {current.question}
        </p>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {current.options.map((opt, i) => {
            let borderColor = 'var(--border)'
            let textColor = 'var(--text-muted)'
            if (answered || phase === 'feedback') {
              if (mode === 'nauka') {
                if (i === current.correct) { borderColor = 'var(--green)'; textColor = 'var(--green)' }
                else if (i === answered?.selected && !answered?.isCorrect) { borderColor = 'var(--red)'; textColor = 'var(--red)' }
              } else {
                if (i === answered?.selected) { borderColor = 'var(--green)'; textColor = 'var(--text)' }
              }
            }
            const isSelected = answered?.selected === i

            return (
              <button
                key={i}
                onClick={() => selectOption(i)}
                disabled={isAnswered && mode === 'nauka'}
                style={{
                  background: 'var(--surface)', border: `2px solid ${isSelected || (mode === 'nauka' && i === current.correct && phase === 'feedback') ? borderColor : 'var(--border)'}`,
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  textAlign: 'left', minHeight: '48px',
                  color: isSelected || (mode === 'nauka' && i === current.correct && phase === 'feedback') ? textColor : 'var(--text-muted)',
                }}
              >
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50', flexShrink: 0, marginTop: '1px',
                  border: `2px solid ${isSelected ? borderColor : 'var(--surface2)'}`,
                  background: isSelected ? borderColor : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <div style={{ width: '7px', height: '7px', background: 'var(--bg)', borderRadius: '50%' }} />}
                </div>
                <span style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{opt}</span>
              </button>
            )
          })}
        </div>

        {/* Correct flash (nauka mode) */}
        {mode === 'nauka' && phase === 'feedback' && answered?.isCorrect && (
          <div style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700, fontSize: '1.1rem' }}>
            Poprawnie! ✓
          </div>
        )}

        {/* Explanation (nauka mode, wrong answer) */}
        {mode === 'nauka' && phase === 'feedback' && answered && !answered.isCorrect && current.explanation && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px',
            color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Wyjaśnienie:</strong>
            {current.explanation}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={goPrev}
            disabled={idx === 0}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '13px', fontWeight: 600,
              fontSize: '0.85rem', color: idx === 0 ? 'var(--text-dim)' : 'var(--text)',
              minHeight: '48px',
            }}
          >
            ‹ WSTECZ
          </button>
          <button
            onClick={() => goNext()}
            disabled={
              (!isAnswered && mode === 'egzamin') ||
              (mode === 'nauka' && phase === 'feedback' && answered?.isCorrect)
            }
            style={{
              background: 'var(--green)', color: '#0f172a', fontWeight: 700,
              borderRadius: '10px', padding: '13px', fontSize: '0.85rem',
              minHeight: '48px',
              opacity: ((!isAnswered && mode === 'egzamin') || (mode === 'nauka' && phase === 'feedback' && answered?.isCorrect)) ? 0.4 : 1,
            }}
          >
            DALEJ ›
          </button>
        </div>
        <button
          onClick={skip}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '11px', fontSize: '0.8rem',
            color: 'var(--text-dim)', minHeight: '48px',
          }}
        >
          POMIŃ
        </button>

        {/* Stats row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', paddingTop: '0.25rem' }}>
          <span style={{ color: 'var(--green)', fontSize: '0.8rem' }}>✓ {correct}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>→ {skipped.size}</span>
          <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>✗ {incorrect}</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify nauka mode in browser**

Start a quiz in tryb nauki — selecting wrong answer should highlight red + correct green + show explanation. Selecting correct answer should flash green and auto-advance.

- [ ] **Step 3: Verify egzamin mode in browser**

Start a quiz in tryb egzaminu — selecting an answer should highlight selection only (no red/green). DALEJ button enables only after selecting.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/QuizSession.jsx
git commit -m "feat: quiz session — question view, timer, nauka/egzamin modes"
```

---

## Task 15: Quiz results screen

**Files:**
- Modify: `frontend/src/pages/QuizResults.jsx`

- [ ] **Step 1: Implement QuizResults.jsx**

```jsx
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { saveSession } from '../api'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function QuizResults() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { questions = [], answers = {}, mode, seconds = 0, sessionPayload } = state || {}

  useEffect(() => {
    if (sessionPayload) {
      saveSession(sessionPayload).catch(() => {})
    }
  }, [])

  const total = questions.length
  const correct = Object.values(answers).filter(a => a.isCorrect).length
  const incorrect = Object.values(answers).filter(a => !a.isCorrect).length
  const skipped = total - Object.keys(answers).length
  const pct = total > 0 ? Math.round(correct / total * 100) : 0

  const missed = questions.filter(q => answers[q.id] && !answers[q.id].isCorrect)

  function retryMissed() {
    navigate('/quiz/session', { state: { questions: missed, mode: 'nauka' } })
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Score */}
      <div style={{
        background: 'var(--surface)', borderRadius: '14px', padding: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: pct >= 70 ? 'var(--green)' : 'var(--red)' }}>
          {pct}%
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
          {correct} / {total} poprawnych · {formatTime(seconds)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
          <span style={{ color: 'var(--green)', fontSize: '0.85rem' }}>✓ {correct} poprawne</span>
          <span style={{ color: 'var(--red)', fontSize: '0.85rem' }}>✗ {incorrect} błędne</span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>→ {skipped} pominięte</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {missed.length > 0 && (
          <button
            onClick={retryMissed}
            style={{
              background: 'var(--green)', color: '#0f172a', fontWeight: 700,
              borderRadius: '12px', padding: '14px', fontSize: '0.95rem', minHeight: '48px',
            }}
          >
            Powtórz błędne ({missed.length})
          </button>
        )}
        <button
          onClick={() => navigate('/quiz')}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '14px', fontSize: '0.95rem',
            color: 'var(--text)', minHeight: '48px',
          }}
        >
          Wróć do menu
        </button>
      </div>

      {/* Missed questions review */}
      {missed.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            BŁĘDNE ODPOWIEDZI
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {missed.map(q => (
              <div key={q.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '1rem', fontSize: '0.85rem',
              }}>
                <p style={{ lineHeight: 1.5, marginBottom: '0.5rem' }}>{q.question}</p>
                <p style={{ color: 'var(--green)', marginBottom: '0.25rem' }}>
                  ✓ {q.options[q.correct]}
                </p>
                {q.explanation && (
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                    {q.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify end-to-end quiz flow in browser**

Complete a short quiz — should see score, missed questions list, and "Powtórz błędne" button if any wrong.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/QuizResults.jsx
git commit -m "feat: quiz results — score, missed questions, retry action"
```

---

## Task 16: Progress page

**Files:**
- Modify: `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Implement Progress.jsx**

```jsx
import { useEffect, useState } from 'react'
import { fetchStats } from '../api'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Progress() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats().then(data => { setStats(data); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Ładowanie...</div>

  const { overall_pct = 0, recent_sessions = [], by_category = [] } = stats

  const worst = [...by_category].sort((a, b) => a.pct - b.pct).slice(0, 2)

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Postęp</h2>

      {/* Overall */}
      <div style={{
        background: 'var(--surface)', borderRadius: '14px', padding: '1.5rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: overall_pct >= 70 ? 'var(--green)' : 'var(--text)' }}>
          {overall_pct}%
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
          opanowania (ostatnie 30 dni)
        </div>
      </div>

      {/* Worst categories */}
      {worst.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
            NAJSŁABSZE KATEGORIE
          </div>
          {worst.map(cat => (
            <div key={cat.category} style={{ marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span>{cat.category}</span>
                <span style={{ color: cat.pct < 60 ? 'var(--red)' : 'var(--text-muted)' }}>{cat.pct}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface2)', borderRadius: '3px' }}>
                <div style={{ width: `${cat.pct}%`, height: '100%', background: cat.pct < 60 ? 'var(--red)' : 'var(--green)', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category breakdown */}
      {by_category.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
            WYNIKI PER KATEGORIA
          </div>
          {by_category.map(cat => (
            <div key={cat.category} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span>{cat.category}</span>
                <span style={{ color: 'var(--text-muted)' }}>{cat.correct}/{cat.total} · {cat.pct}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface2)', borderRadius: '3px' }}>
                <div style={{ width: `${cat.pct}%`, height: '100%', background: 'var(--green)', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
          OSTATNIE SESJE
        </div>
        {recent_sessions.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Brak sesji. Zrób pierwszy quiz!</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {recent_sessions.map(s => {
            const pct = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0
            return (
              <div key={s.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '0.85rem 1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {s.mode === 'nauka' ? '📚 Nauka' : '✍️ Egzamin'}
                    {s.category && ` · ${s.category}`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {formatDate(s.finished_at)} · {s.correct}/{s.total} pytań
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: pct >= 70 ? 'var(--green)' : 'var(--red)' }}>
                  {pct}%
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

After completing at least one quiz, navigate to Postęp — should show overall %, session history, and category breakdown.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Progress.jsx
git commit -m "feat: progress page — overall %, category breakdown, session history"
```

---

## Task 17: Deployment config

**Files:**
- Create: `Procfile`
- Create: `render.yaml`

- [ ] **Step 1: Create Procfile**

```
web: gunicorn backend.server:app --bind 0.0.0.0:$PORT
```

- [ ] **Step 2: Create render.yaml**

```yaml
services:
  - type: web
    name: makler-exam-app
    runtime: python
    buildCommand: pip install -r requirements.txt && cd frontend && npm install && npm run build
    startCommand: gunicorn backend.server:app --bind 0.0.0.0:$PORT
    envVars:
      - key: SECRET_KEY
        generateValue: true
      - key: APP_PASSWORD_HASH
        sync: false
      - key: DB_PATH
        value: /var/data/database.db
    disk:
      name: db
      mountPath: /var/data
      sizeGB: 1
```

> The `disk` block provisions a persistent disk on Render so SQLite data survives redeploys. Free tier does not include persistent disks — upgrade to Starter ($7/mo) or keep DB_PATH at the default (data resets on each deploy).

- [ ] **Step 3: Test production build locally**

```bash
cd ~/Desktop/makler-exam-app/frontend
npm run build
cd ..
APP_PASSWORD_HASH='<your hash>' SECRET_KEY='test' python -m gunicorn backend.server:app
```

Open http://localhost:8000 — full app served by Flask from built React files.

- [ ] **Step 4: Commit**

```bash
git add Procfile render.yaml
git commit -m "chore: Render deployment config with persistent disk"
```

---

## Task 18: Deploy to Render

- [ ] **Step 1: Push to GitHub**

```bash
cd ~/Desktop/makler-exam-app
gh repo create makler-exam-app --private --source=. --push
```

- [ ] **Step 2: Create Render web service**

Go to https://dashboard.render.com → New → Web Service → connect your `makler-exam-app` GitHub repo.

Or use render.yaml (Blueprint): New → Blueprint → select repo.

- [ ] **Step 3: Set environment variable**

In Render dashboard → Environment → Add:
- `APP_PASSWORD_HASH` = `<bcrypt hash from Task 3>`

- [ ] **Step 4: Trigger deploy and verify**

Wait for build to complete (~3 min). Open the Render URL on your phone — should load the full app, login with your password, and work end-to-end.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: post-deploy verification complete"
```
