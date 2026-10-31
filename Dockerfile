# Cloud Run image for the nikuda Flask app, built by Cloud Build via
# `gcloud run deploy --source .` (see gcloud_run_deploy.sh from utils-bash).
FROM python:3.14-slim

WORKDIR /app

# Install exactly what uv.lock pins (and CI tested), hash-checked, never a
# fresh resolve. --locked fails the build if the lock is stale against
# pyproject.toml; --no-emit-project skips the (package = false) project.
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv export --locked --no-dev --no-emit-project -o /tmp/requirements.txt \
    && uv pip install --system --no-cache --require-hashes -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt \
    && pip uninstall -y uv

# The app resolves src/data and its static asset dirs relative to the
# repo root, so preserve the src/ layout under /app.
COPY src/ src/
# The deploy stamp is written by gcloud_run_deploy.sh just before deploying;
# building without it fails on purpose so an unstamped image never ships.
COPY build_info.json ./

# Cloud Run sets PORT; default to 8080 for local `docker run`. One process:
# the service has a single CPU, and each process holds its own copy of the
# Nakdimon model (~240MB with the dictionary) against a 512MiB limit.
CMD ["sh", "-c", "exec gunicorn -b :${PORT:-8080} -w 1 --threads 8 src.main:app"]
