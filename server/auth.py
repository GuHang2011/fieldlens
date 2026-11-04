"""Operator-managed accounts and revocable, server-side sessions."""
import hashlib
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from urllib.parse import urlsplit

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

COOKIE = "fieldlens_session"
LIFETIME = 8 * 60 * 60
DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(32))


def database_path():
    return Path(os.environ.get("FIELDLENS_AUTH_DB", Path(__file__).resolve().parent.parent / "instance" / "accounts.sqlite3"))


class Accounts:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                  name TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
                CREATE TABLE IF NOT EXISTS sessions (
                  digest TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS attempts (bucket TEXT NOT NULL, stamp REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS attempts_time ON attempts(stamp);
                CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def set_user(self, username, password, name=None, reset=False):
        username = username.strip().lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,39}", username):
            raise ValueError("账号需为 3–40 位字母、数字、下划线、点或短横线")
        if not 12 <= len(password) <= 128:
            raise ValueError("密码需为 12–128 个字符")
        if name is not None and not 1 <= len(name.strip()) <= 60:
            raise ValueError("姓名需为 1–60 个字符")
        hashed = generate_password_hash(password)
        with self.connect() as db:
            existing = db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
            if reset:
                if not existing:
                    raise ValueError("账号不存在")
                db.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, existing["id"]))
                db.execute("DELETE FROM sessions WHERE user_id=?", (existing["id"],))
            else:
                if existing:
                    raise ValueError("账号已存在")
                db.execute("INSERT INTO users(id,username,name,password_hash) VALUES(?,?,?,?)", (secrets.token_hex(16), username, (name or username).strip(), hashed))

    def login(self, username, password, address):
        now = time.time()
        buckets = ("ip:" + address, "user:" + username)
        # Reserve an attempt before hashing so concurrent attempts share the same limit.
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM attempts WHERE stamp<?", (now - 900,))
            db.execute("DELETE FROM sessions WHERE expires<?", (now,))
            for bucket in buckets:
                count = db.execute("SELECT COUNT(*) FROM attempts WHERE bucket=?", (bucket,)).fetchone()[0]
                if count >= 8:
                    return None, 429
            db.executemany("INSERT INTO attempts VALUES(?,?)", [(bucket, now) for bucket in buckets])
            user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        valid = check_password_hash(user["password_hash"] if user else DUMMY_HASH, password)
        if not valid or not user or not user["active"]:
            return None, 401
        token = secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            # Do not resurrect a session when the account was disabled/reset while hashing.
            current = db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
            if not current or not current["active"] or current["password_hash"] != user["password_hash"]:
                return None, 401
            db.execute("INSERT INTO sessions VALUES(?,?,?)", (self.digest(token), user["id"], now + LIFETIME))
            # Successful sign-ins should not consume a shared team's failure budget.
            db.executemany("DELETE FROM attempts WHERE bucket=? AND stamp=?", [(bucket, now) for bucket in buckets])
        return token, 200

    @staticmethod
    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def user(self, token):
        if not token or len(token) > 100:
            return None
        with self.connect() as db:
            row = db.execute("SELECT u.id,u.username,u.name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.digest=? AND s.expires>? AND u.active=1", (self.digest(token), time.time())).fetchone()
        return dict(row) if row else None

    def revoke(self, token):
        if token:
            with self.connect() as db:
                db.execute("DELETE FROM sessions WHERE digest=?", (self.digest(token),))

    def disable(self, username):
        with self.connect() as db:
            row = db.execute("SELECT id FROM users WHERE username=?", (username.lower(),)).fetchone()
            if not row:
                raise ValueError("账号不存在")
            db.execute("UPDATE users SET active=0 WHERE id=?", (row["id"],))
            db.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))


def install_auth(app):
    enabled = os.environ.get("FIELDLENS_AUTH_ENABLED", "false").lower() == "true"
    secure = os.environ.get("FIELDLENS_COOKIE_SECURE", "false").lower() == "true"
    accounts = Accounts(database_path()) if enabled else None
    app.extensions["accounts"] = accounts

    @app.before_request
    def authenticate():
        if not request.path.startswith("/api/"):
            return None
        if request.path.startswith("/api/auth/") or enabled:
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                origin = request.headers.get("Origin")
                if (origin and urlsplit(origin).netloc != request.host) or request.headers.get("Sec-Fetch-Site") == "cross-site" or request.headers.get("X-FieldLens-Request") != "1":
                    return jsonify(error="请从同源禾镜页面发起操作"), 403
        if enabled:
            g.user = accounts.user(request.cookies.get(COOKIE))
            if not request.path.startswith("/api/auth/") and not g.user:
                return jsonify(error="请先登录，或重新登录已过期的会话", code="login_required"), 401

    @app.get("/api/auth/session")
    def session_status():
        return jsonify(enabled=enabled, user=g.get("user"), expiresIn=LIFETIME)

    @app.post("/api/auth/login")
    def login():
        if not enabled:
            return jsonify(error="尚未启用账号登录，请联系管理员"), 503
        if not request.is_json:
            return jsonify(error="请求必须为 JSON"), 415
        if len(request.get_data()) > 4096:
            return jsonify(error="登录内容过长"), 413
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("username"), str) or not isinstance(data.get("password"), str):
            return jsonify(error="请输入账号和密码"), 400
        username = data["username"].strip().lower()
        if not 1 <= len(username) <= 40 or not 1 <= len(data["password"]) <= 128:
            return jsonify(error="账号或密码格式无效"), 400
        token, status = accounts.login(username, data["password"], request.remote_addr or "unknown")
        if status != 200:
            response = jsonify(error="尝试次数过多，请 15 分钟后重试" if status == 429 else "账号或密码错误，或账号已停用")
            if status == 429:
                response.headers["Retry-After"] = "900"
            return response, status
        accounts.revoke(request.cookies.get(COOKIE))
        response = jsonify(user=accounts.user(token))
        response.set_cookie(COOKIE, token, max_age=LIFETIME, httponly=True, secure=secure, samesite="Lax", path="/api")
        return response

    @app.post("/api/auth/logout")
    def logout():
        if accounts:
            accounts.revoke(request.cookies.get(COOKIE))
        response = jsonify(ok=True)
        response.delete_cookie(COOKIE, path="/api", httponly=True, secure=secure, samesite="Lax")
        return response
