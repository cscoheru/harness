# fish-harness v1.0 Dockerfile (T-DO-1 + T-DO-2 patch)
#
# Contract per `docs/v1.0-ga-team-plan.md` §2 T-DO-1:
#   - base:       python:3.12-slim  (matches pyproject requires-python)
#   - install:    pip install .     (pyproject.toml + harness/)
#   - verify:     docker run --rm <img> python -c "import harness"
#   - CMD:        python -m harness (resolves to harness/__main__.py)
#
# DEVIATION (per `docs/ADJUDICATION-sqlite-raise-T-DO-2.md` Accepted):
#   - Actual base = `python:3.14-alpine` (plan spec was `python:3.12-slim`).
#   - Reason: spec/kernel-schema.sql uses expression-form
#     `RAISE(ABORT, 'msg' || NEW.col || ...)` in I16/I17 + lineage
#     triggers. SQLite supports arbitrary expressions in RAISE()'s
#     second arg only since 3.47.0 (2024-10-21 changelog). Every
#     `python:3.X-slim` / `python:3.14-trixie` ships SQLite 3.46.1
#     (Debian Bookworm). `python:3.14-alpine` ships SQLite 3.53.2 ✓.
#     Adjudication tried `python:3.12-alpine` first per plan closeness;
#     Docker Hub unavailable during build, fallback to 3.14-alpine used.
#   - HARD GATE (enforced at build time, see RUN below):
#       assert sqlite3.sqlite_version >= 3.47.0
#   - musl/alpine trade-off accepted: our deps (httpx, jsonschema) are
#     pure-Python wheels → musl-safe.
#
# Build context MUST contain:
#   - pyproject.toml    : package metadata (deps = httpx>=0.28,<0.29 + jsonschema>=4.0,<5)
#   - README.md         : referenced by [project].readme; required by setuptools
#   - harness/          : source package; [tool.setuptools.packages.find] scans it
#
# Build:
#   docker build -t fish-harness:1.0.0a0 .
#
# Run (verify install + version):
#   docker run --rm fish-harness:1.0.0a0 python -c "import harness; print(harness.__version__)"
#   # → 1.0.0a0

FROM python:3.14-alpine

# Keep Python from writing .pyc + force stdout flush (cleaner logs in
# `docker logs`).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# v1.2.0b (per F2 + audit-scope §4.11): pre-install build tools so a future
# wrapper image build (better-sqlite3 native compile via npm install) can run
# in this base. Currently the wrapper image is NOT built from this Dockerfile
# (wrapper deploys via bind mount in deploy/6host-compose.newvps.yml using
# node:22-alpine directly), but the build tools are here as a defensive
# guard for the eventual unified wrapper image. node-gyp requires
# python3 + make + g++ on alpine.
RUN apk add --no-cache python3 make g++

# Order matters: setuptools' packages.find resolves at install time, so
# harness/ MUST be present BEFORE `pip install .` runs. Splitting COPY
# into two steps lets the install layer (everything above this line)
# cache across source-only edits — well, mostly: any harness/ change
# busts both the source layer and the pip install layer because they
# are adjacent. A future optimization (T-DO-3 .dockerignore + multi-
# stage) can shave this; v1.0 keeps the simple shape.
COPY pyproject.toml README.md ./
COPY harness/ ./harness/

# spec/ is the Protocol contract source. pyproject [tool.setuptools.packages.find]
# EXCLUDES spec* from the wheel (spec is specification, not runtime), but
# harness.runtime / harness.gateway do `from spec.interfaces import ...`
# at module load time, so spec MUST be present inside the image at runtime.
# Excluded from the wheel; copied into the image at /app/spec.
COPY spec/ ./spec/

# --no-cache-dir keeps the image lean (no /root/.cache/pip).
# --no-compile skips writing .pyc (we set PYTHONDONTWRITEBYTECODE above
# but belt-and-suspenders here).
RUN pip install --no-cache-dir --no-compile .

# Hard gate per ADJUDICATION-sqlite-raise-T-DO-2.md: bundled SQLite MUST
# be >= 3.47.0 to apply spec/kernel-schema.sql (RAISE(expr)). Split
# into a dedicated RUN so the assertion failure produces a clean
# error message rather than a shell pipeline parse error.
RUN python -c "import sqlite3; v=sqlite3.sqlite_version; t=tuple(map(int, v.split('.'))); assert t >= (3, 47, 0), f'SQLite {v} too old; schema needs >=3.47.0 (RAISE(expr)).'; print(f'sqlite3 gate OK: {v}')"

# Make spec importable (it lives at /app/spec, not on the Python path
# by default). /app is CWD inside the container, so PYTHONPATH=/app
# covers both `import harness` and `from spec.interfaces import ...`.
ENV PYTHONPATH=/app

# Default CMD: print package version via `python -m harness` → harness/__main__.py
CMD ["python", "-m", "harness"]
