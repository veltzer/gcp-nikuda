# Cloud Run image for the nikuda Flask app, built by Cloud Build via
# `gcloud run deploy --source .` (see scripts/deploy.sh).
FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The app resolves src/data and its static asset dirs relative to the
# repo root, so preserve the src/ layout under /app.
COPY src/ src/
# The deploy stamp is written by scripts/deploy.sh just before deploying;
# building without it fails on purpose so an unstamped image never ships.
COPY build_info.json ./

# Cloud Run sets PORT; default to 8080 for local `docker run`.
CMD ["sh", "-c", "exec gunicorn -b :${PORT:-8080} -w 2 --threads 4 src.main:app"]
