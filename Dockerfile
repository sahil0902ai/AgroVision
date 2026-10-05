# AgroVision AI Engine — Production Dockerfile
FROM python:3.10-slim

# Avoid prompts and write clean logs
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Install essential system build libraries for OpenCV & PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU first (compact and fast)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Copy requirements and install remaining python packages
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source code, model weights, and frontend assets
COPY backend/ /app/backend/
COPY datasets/ /app/datasets/
COPY frontend/ /app/frontend/
COPY run.py /app/run.py

# Create required upload directories
RUN mkdir -p uploads/images uploads/heatmaps

EXPOSE 8000

# Start production uvicorn server
CMD ["python", "run.py"]
