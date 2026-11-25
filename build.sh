#!/usr/bin/env bash
# exit on error
set -o errexit

echo "===> Upgrading pip, setuptools, and wheel..."
python -m pip install --no-cache-dir --upgrade pip setuptools wheel

echo "===> Installing lightweight CPU-only PyTorch and torchvision..."
pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

echo "===> Installing application requirements..."
pip install --no-cache-dir -r requirements.txt

echo "===> AgroVision build complete!"
