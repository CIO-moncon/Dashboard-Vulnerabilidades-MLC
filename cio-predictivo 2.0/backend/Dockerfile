# ============================================================================
# CIO Predictivo 2.0 — Backend (FastAPI + SQLite)
# ============================================================================
FROM python:3.11-slim AS base

# Evitar archivos .pyc y buffering de stdout/stderr.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencias del sistema (compilación + libs de matplotlib/Pillow).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libfreetype6 \
        libpng16-16 \
        libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python primero (mejor cache de capas).
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend.
COPY . .

# Usuario no root para ejecución.
RUN useradd --create-home --shell /bin/bash cio \
    && mkdir -p /data \
    && chown -R cio:cio /app /data
USER cio

# Base de datos persistente fuera del código (volumen).
ENV CIO_DB_PATH=/data/cio_predictivo.db \
    CIO_IMPORTAR_FIREBASE=0

EXPOSE 8000

# Healthcheck básico.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]