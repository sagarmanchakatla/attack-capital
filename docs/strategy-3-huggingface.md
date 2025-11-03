## Strategy 3 — Hugging Face Model (FastAPI)

**Goal**: Run a dedicated ML microservice using `jakeBland/wav2vec-vm-finetune` to classify voicemail vs. human from 2–5s audio.

### Service Overview
- Location: `python-service/app/main.py`
- Endpoints:
  - `POST /predict` — file upload (2–5s). Returns `{ label, confidence, processing_time_ms, model_info }`.
  - `POST /predict-stream` — same response, used when chunking.
  - `GET /health`, `GET /model-info`.
- Loads model once at startup; uses GPU if available.

### Running Locally
```bash
cd python-service/app
pip install fastapi uvicorn torch transformers librosa numpy
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Expose via ngrok if Next.js runs remotely.

### Integration Patterns
1. Buffered chunks (recommended):
   - Accumulate 2–3s of 16kHz mono audio from Twilio Media Streams.
   - POST to `/predict`. Use result immediately.
2. Sliding window:
   - Send overlapping 1.5–2.0s windows every 500ms for earlier signals.
   - Require 2 consecutive high‑confidence machine to hang up; 1 high‑confidence human to connect.

### Latency Optimization
- Export model to ONNX and enable inference session with CPU EP for cost efficiency; or CUDA EP for speed.
- Keep buffers small (2–3s) and normalize audio once.
- Reuse HTTP connection or consider a lightweight gRPC/WebSocket for streaming.

### Confidence & Policy
- Suggested thresholds:
  - `confidence >= 0.85` → accept decision
  - `0.7 <= confidence < 0.85` → retry once (max total 2)
  - `< 0.7` → undecided; treat as human and keep monitoring
- Always log `confidence`, `audio_length_seconds`, `latency`.

### Failure Handling
- HTTP 503: model not loaded → backoff/retry up to 2x.
- 4xx from preproc: skip and mark undecided.
- Timeouts > 2.5s: cancel and route as human to avoid UX delays.

### Testing Checklist
- 10+ clips (voicemail and human) run through `/predict` manually (curl or UI upload) to sanity‑check.
- Live Twilio Media Streams with buffered windows.
- Compare against Twilio Native and Jambonz for false positives/negatives.
