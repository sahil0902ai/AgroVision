# 🚀 AgroVision — Vercel & Cloud Deployment Guide

This guide walks you through deploying **AgroVision** to **Vercel** in just a few minutes.

---

## 🏗️ Architecture Overview

AgroVision uses a modern decoupled architecture:
1. **Frontend (Vercel)**: Hosted globally on Vercel Edge Network for lightning-fast loading, SSL, and instant continuous deployments from GitHub.
2. **AI Inference Backend (Render / Railway / HuggingFace / Cloud Container)**: Hosts the Python FastAPI service running PyTorch CNN & Neuromorphic SNN models.

---

## ⚡ Step 1: Deploy Frontend to Vercel (1 Minute)

1. Go to **[vercel.com](https://vercel.com)** and log in with your GitHub account.
2. Click **"Add New..."** ➔ **"Project"**.
3. Locate and select your repository: **`sahil0902ai/AgroVision`**.
4. Configure Project Settings:
   - **Framework Preset**: `Other` (or default).
   - **Root Directory**: `./` (Leave as root because `vercel.json` already manages routing and rewrites).
   - **Build & Output Settings**: Leave default / empty.
5. Click **"Deploy"**.

Your frontend will go live immediately at `https://agrovision-<your-username>.vercel.app`! 🎉

---

## ⚡ Step 2: Deploy AI Backend (Free, 2 Minutes)

Because PyTorch and SNN models require Python C-extensions, host the backend on a free Python/Docker container:

### Option A: Render.com (Recommended Free Tier)
1. Go to **[render.com](https://render.com)** and sign in with GitHub.
2. Click **"New +"** ➔ **"Web Service"**.
3. Connect your repository: `sahil0902ai/AgroVision`.
4. Configure settings:
   - **Language**: `Python 3` (or `Docker`)
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `python run.py`
   - **Plan**: `Free`
5. Click **"Create Web Service"**.
6. Render will generate a URL like `https://agrovision-api.onrender.com`.

### Option B: Hugging Face Spaces (Zero-Config Docker)
1. Go to **[huggingface.co/spaces](https://huggingface.co/spaces)**.
2. Create Space ➔ Select **Docker** (Blank).
3. Connect your GitHub repository. It will automatically build and expose the FastAPI docs and endpoints.

---

## ⚡ Step 3: Link Vercel to Your Live Backend

Once your backend URL is live (e.g. `https://agrovision-api.onrender.com`):

### Method 1: Using `vercel.json` Rewrite Proxy (Recommended)
Open `vercel.json` and add an API rewrite proxy rule so all `/api/*` traffic forwards seamlessly to your backend:
```json
{
  "source": "/api/:path*",
  "destination": "https://agrovision-api.onrender.com/api/:path*"
}
```
Commit and push to GitHub — Vercel will auto-deploy!

### Method 2: In-App Runtime Configuration
In the browser, open Developer Console (F12) or settings and run:
```javascript
window.AGROVISION_CONFIG.setApiBase("https://agrovision-api.onrender.com");
```
AgroVision will immediately route all scans and SNN checks to your remote backend.

---

## 🧪 Testing Your Deployment
1. Visit `https://your-app.vercel.app/`
2. Click **"Farmer Dashboard"**
3. Select a sample leaf image (`datasets/sample_leaves/...`)
4. Adjust microclimate environmental sliders
5. Run **"Analyze Leaf"** ➔ Watch live CNN + SNN + Multimodal Fusion results!
