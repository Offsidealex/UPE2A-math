from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import psycopg2
import psycopg2.extras
import os
import random
import string

app = FastAPI(title="UPE2A Maths API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TEACHER_PASSWORD = os.getenv("TEACHER_PASSWORD", "diderot2024")
DATABASE_URL = os.getenv("DATABASE_URL")


def get_db():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS class_codes (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            class_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            student_name TEXT NOT NULL,
            class_id TEXT NOT NULL,
            exercise_type TEXT NOT NULL,
            level TEXT NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    cur.close()
    conn.close()


init_db()


@app.get("/")
def index():
    return FileResponse("index.html")

@app.get("/prof")
def prof():
    return FileResponse("prof.html")


def check_teacher(x_teacher_password: Optional[str] = Header(None)):
    if x_teacher_password != TEACHER_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return True


class SessionCreate(BaseModel):
    student_name: str
    class_id: str
    exercise_type: str   # 'nombres' | 'tables'
    level: str           # nombres: '10','20','100','1000' / tables: '5_A','0_C', etc.
    score: int
    total: int


class ClassCodeCreate(BaseModel):
    class_name: str


def _generate_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


# ── Class codes ───────────────────────────────────────────────────────────────

@app.get("/class-codes/verify")
def verify_class_code(code: str = Query(...)):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM class_codes WHERE code=%s", (code.upper(),))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Code invalide")
    return dict(row)


@app.get("/class-codes")
def list_class_codes(auth=Depends(check_teacher)):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM class_codes ORDER BY created_at DESC")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [dict(r) for r in rows]


@app.post("/class-codes", status_code=201)
def create_class_code(body: ClassCodeCreate, auth=Depends(check_teacher)):
    conn = get_db()
    cur = conn.cursor()
    for _ in range(10):
        code = _generate_code()
        try:
            cur.execute(
                "INSERT INTO class_codes (code, class_name) VALUES (%s, %s) RETURNING id",
                (code, body.class_name)
            )
            new_id = cur.fetchone()[0]
            conn.commit(); cur.close(); conn.close()
            return {"id": new_id, "code": code, "class_name": body.class_name}
        except Exception:
            conn.rollback()
    cur.close(); conn.close()
    raise HTTPException(status_code=500, detail="Impossible de générer un code unique")


@app.delete("/class-codes/{code_id}")
def delete_class_code(code_id: int, auth=Depends(check_teacher)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM class_codes WHERE id=%s", (code_id,))
    conn.commit(); cur.close(); conn.close()
    return {"message": "Code supprimé"}


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.post("/sessions", status_code=201)
def save_session(s: SessionCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM class_codes WHERE code=%s", (s.class_id,))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Code de classe invalide")
    cur.execute(
        "INSERT INTO sessions (student_name, class_id, exercise_type, level, score, total) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (s.student_name, s.class_id, s.exercise_type, s.level, s.score, s.total)
    )
    conn.commit(); cur.close(); conn.close()
    return {"message": "Session enregistrée"}


@app.get("/sessions")
def list_sessions(
    class_id: Optional[str] = Query(None),
    student_name: Optional[str] = Query(None),
    exercise_type: Optional[str] = Query(None),
    auth=Depends(check_teacher),
):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    q = "SELECT * FROM sessions WHERE 1=1"
    params = []
    if class_id:
        q += " AND class_id=%s"; params.append(class_id)
    if student_name:
        q += " AND student_name ILIKE %s"; params.append(f"%{student_name}%")
    if exercise_type:
        q += " AND exercise_type=%s"; params.append(exercise_type)
    q += " ORDER BY completed_at DESC"
    cur.execute(q, params)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [dict(r) for r in rows]


@app.get("/sessions/student")
def student_sessions(student_name: str = Query(...), class_id: str = Query(...)):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM sessions WHERE student_name ILIKE %s AND class_id=%s ORDER BY completed_at DESC",
        (student_name, class_id)
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [dict(r) for r in rows]


@app.get("/stats")
def stats(auth=Depends(check_teacher)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM sessions")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT student_name || '|' || class_id) FROM sessions")
    students = cur.fetchone()[0]
    cur.execute("SELECT DISTINCT class_id FROM sessions ORDER BY class_id")
    classes = [r[0] for r in cur.fetchall()]
    cur.close(); conn.close()
    return {"total_sessions": total, "total_students": students, "classes": classes}
