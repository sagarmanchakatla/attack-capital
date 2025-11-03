#!/usr/bin/env python3

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import torch
from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2FeatureExtractor
import librosa
import numpy as np
import io
import logging
from typing import Dict, Any
import os
from pydantic import BaseModel
import time 

# ------------------ Logging Setup ------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ------------------ FastAPI App ------------------
app = FastAPI(title="AMD HuggingFace Service", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ Globals ------------------
model = None
feature_extractor = None
device = None


class PredictionResponse(BaseModel):
    label: str
    confidence: float
    processing_time_ms: float
    model_info: Dict[str, Any]


# ------------------ Startup: Load Model ------------------
@app.on_event("startup")
async def load_model():
    """Load HuggingFace model at startup"""
    global model, feature_extractor, device

    try:
        model_name = "jakeBland/wav2vec-vm-finetune"
        logger.info(f"🔄 Loading HuggingFace model: {model_name}")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"🧠 Using device: {device}")

        feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(model_name)
        model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name)
        model.to(device)
        model.eval()

        logger.info(f"✅ Model loaded successfully: {model_name}")
        logger.info(f"Model labels: {model.config.id2label}")

    except Exception as e:
        logger.exception("❌ Failed to load model")
        raise e


# ------------------ Audio Preprocessing ------------------
def preprocess_audio(audio_data: bytes, target_sr: int = 16000) -> np.ndarray:
    """Convert bytes to normalized mono waveform"""
    try:
        logger.info("🎧 Starting audio preprocessing")
        audio_buffer = io.BytesIO(audio_data)

        # Load and resample using librosa
        audio, sr = librosa.load(audio_buffer, sr=target_sr)
        logger.info(f"Audio loaded: {len(audio)} samples @ {sr} Hz")

        # Normalize amplitude
        if np.max(np.abs(audio)) > 0:
            audio = audio / np.max(np.abs(audio))
        logger.info(f"Audio normalized, max amplitude: {np.max(np.abs(audio)):.4f}")

        # Trim or pad to 2–5s range
        min_length = target_sr * 2
        max_length = target_sr * 5
        if len(audio) < min_length:
            logger.info(f"Padding audio from {len(audio)} → {min_length}")
            audio = np.pad(audio, (0, min_length - len(audio)), mode="constant")
        elif len(audio) > max_length:
            logger.info(f"Truncating audio from {len(audio)} → {max_length}")
            audio = audio[:max_length]

        return audio

    except Exception as e:
        logger.exception("Audio preprocessing failed")
        raise HTTPException(status_code=400, detail=f"Audio preprocessing failed: {e}")


# ------------------ Predict Endpoint ------------------
@app.post("/predict", response_model=PredictionResponse)
async def predict_amd(file: UploadFile = File(...)):
    """Predict human vs voicemail from uploaded audio"""
    start_time = time.time()

    try:
        if model is None or feature_extractor is None:
            raise HTTPException(status_code=503, detail="Model not loaded")

        audio_data = await file.read()
        logger.info(f"📦 Received file: {file.filename}, {len(audio_data)} bytes")

        audio = preprocess_audio(audio_data, target_sr=feature_extractor.sampling_rate)

        logger.info("🧩 Extracting features...")
        inputs = feature_extractor(
            audio,
            sampling_rate=feature_extractor.sampling_rate,
            return_tensors="pt",
            padding=True,
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probabilities = torch.nn.functional.softmax(logits, dim=-1)

        predicted_class = torch.argmax(probabilities, dim=-1).item()
        confidence = probabilities[0][predicted_class].item()

        # Use dynamic label mapping from model config
        id2label = model.config.id2label
        label = id2label[predicted_class].lower()

        processing_time = (time.time() - start_time) * 1000

        # Log internal details
        logger.info({
            "logits": logits.cpu().numpy().tolist(),
            "probabilities": probabilities.cpu().numpy().tolist(),
            "predicted_class": predicted_class,
            "mapped_label": label,
            "confidence": confidence,
            "time_ms": processing_time
        })

        logger.info(f"✅ Prediction: {label} (confidence: {confidence:.3f}, time: {processing_time:.1f} ms)")

        return PredictionResponse(
            label=label,
            confidence=confidence,
            processing_time_ms=processing_time,
            model_info={
                "model_name": "jakeBland/wav2vec-vm-finetune",
                "device": str(device),
                "audio_length_seconds": len(audio) / feature_extractor.sampling_rate,
                "id2label": id2label
            },
        )

    except Exception as e:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


# ------------------ Streaming Prediction (Optional) ------------------
@app.post("/predict-stream")
async def predict_stream_chunk(file: UploadFile = File(...)):
    """Process streaming audio chunk (2–5s)"""
    return await predict_amd(file)


# ------------------ Health + Model Info ------------------
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": str(device) if device else None,
        "service": "HuggingFace AMD Service",
    }


@app.get("/model-info")
async def model_info():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    params = sum(p.numel() for p in model.parameters())
    size_mb = sum(p.numel() * p.element_size() for p in model.parameters()) / 1024 / 1024

    return {
        "model_name": "jakeBland/wav2vec-vm-finetune",
        "device": str(device),
        "parameters": params,
        "size_mb": round(size_mb, 2),
        "id2label": model.config.id2label,
    }


# ------------------ Main ------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"🚀 Starting HuggingFace AMD Service on {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=True, log_level="info")
