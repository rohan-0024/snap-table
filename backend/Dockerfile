# Optional: container image for any Docker host (Render Docker runtime, Koyeb, Cloud Run, a VPS).
# The default free deploy uses render.yaml with Render's native Python runtime and doesn't need this.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH OMP_NUM_THREADS=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user app ./app
COPY --chown=user scripts/download_models.py ./scripts/download_models.py
RUN python scripts/download_models.py

# Most hosts inject $PORT; fall back to 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
