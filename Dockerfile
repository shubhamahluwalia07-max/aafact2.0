# Lightweight Python base image
FROM python:3.11-slim

# Prevent Python from writing .pyc files & enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    HOME=/home/user

# Install system dependencies for 3D computational geometry
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for Hugging Face Spaces (UID 1000)
RUN useradd -m -u 1000 user

WORKDIR /app

# Install Python packages first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Ensure storage directories exist with full read/write permissions for user 1000
RUN mkdir -p uploads outputs/aligned outputs/cut_segments sample_data && \
    chown -R user:user /app && \
    chmod -R 777 uploads outputs sample_data

# Switch to non-root user
USER user

# Hugging Face Spaces standard port
EXPOSE 7860

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://127.0.0.1:7860/api/status || exit 1

# Start Gunicorn production WSGI server
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "2", "--threads", "4", "--timeout", "180", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
