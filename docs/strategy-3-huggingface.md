Here is comprehensive documentation for **Strategy 3: Hugging Face ML Model Service**, reflecting your actual architectural approach and deployment decisions:

---

# Strategy 3: Hugging Face ML Model Service

## **Overview**

This strategy uses a custom machine learning model, deployed via a FastAPI Python microservice, to classify whether a call was answered by a human or a voicemail/machine. The model is based on Facebook’s Wav2Vec2 architecture and fine-tuned for the voicemail detection task using Hugging Face.

---

## **Flow & Implementation Steps**

### **1. Audio Capture & Buffering**

- When a call is active, Twilio Media Streams can stream real-time audio chunks to your backend.
- **Deployment Constraint:**  
  Exposing an additional public WebSocket endpoint for live audio streaming (while also running your Next.js app) is complex, risky, and often infeasible in secure/cloud environments.
- **Your Approach:**  
  Instead of streaming and classifying in real-time, you buffer the call’s audio during its duration. Once the call is complete (or enough buffered data is available), you send the captured audio to the Hugging Face ML service for classification in a single batch request.

### **2. ML Service Setup**

- **Framework:** FastAPI (Python)
- **Model:** `jakeBland/wav2vec-vm-finetune` (from Hugging Face Hub)
- **Endpoints:**
  - `POST /predict`: Accepts audio file (WAV, 2–5 sec), returns prediction and confidence.
  - Optional: `POST /predict-stream`, `GET /health`, `GET /model-info`

### **3. Classification Logic**

- The backend sends the buffered audio file to the Python service via HTTP.
- The service loads and normalizes the audio, runs inference with the Wav2Vec2 model, and returns:

  - `label`: `"human"` or `"voicemail"`
  - `confidence`: Probability score (e.g. `0.94`)
  - Processing time and metadata

- The backend consumes the ML result, updates the DB with classification, and updates the UI/history.

---

## **Code Flow Example (FastAPI + Next.js Integration)**

**Python FastAPI Service:**

```python
# main.py
from fastapi import FastAPI, File, UploadFile
from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2Processor

app = FastAPI()

# Load model
processor = Wav2Vec2Processor.from_pretrained("jakeBland/wav2vec-vm-finetune")
model = Wav2Vec2ForSequenceClassification.from_pretrained("jakeBland/wav2vec-vm-finetune")

@app.post("/predict")
async def predict(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    # preprocess: normalize, pad, etc.
    inputs = processor(audio_bytes, sampling_rate=16000, return_tensors="pt")
    logits = model(**inputs).logits
    label = "human" if logits.argmax() == 0 else "voicemail"
    confidence = logits.softmax(dim=-1).max().item()
    return {"label": label, "confidence": confidence}
```

**Next.js Backend:**

```typescript
// After call completion, send buffered audio for classification
const formData = new FormData();
formData.append("audio", bufferedAudioBlob);

const response = await fetch(`${process.env.HF_SERVICE_URL}/predict`, {
  method: "POST",
  body: formData,
});
const { label, confidence } = await response.json();
await prisma.callLog.update({
  where: { callSid },
  data: { status: label.toUpperCase(), confidence },
});
```

---

## **Strengths and Tradeoffs**

**Strengths:**

- High accuracy (85–92%)—especially compared to purely rules-based AMD
- Fully customizable: possible to retrain/redeploy model for different languages/accents
- Cost-effective (runs on your infra; no per-call API fees)

**Tradeoffs:**

- Not true real-time: classification occurs after the call; immediate UI actions during a call (like mid-greeting hangup) aren’t possible
- Requires ML expertise to maintain and optimize
- Needs GPU for best latency; CPU inference can be slower
- Deployment considerations (Python microservice, Docker, etc.)

---

## **Configuration and Best Practices**

- Always normalize audio to 16kHz mono before inference
- Use ONNX exported models or batch inference for lowest latency at scale
- Retry if confidence is low (`< 0.7`), log and present ‘undecided’ option if model cannot decide
- Thoroughly test with real-world call recordings from your production environment to minimize false positives/negatives

---

## **Sample API Payloads & Responses**

**Request (from Next.js backend):**

```http
POST /predict
Content-Type: multipart/form-data

(audio file in "audio" field)
```

**Response:**

```json
{
  "label": "human",
  "confidence": 0.92,
  "processing_time_ms": 847
}
```

---

## **References & Resources**

- [Hugging Face Wav2Vec2 Model](https://huggingface.co/jakeBland/wav2vec-vm-finetune)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Twilio Media Streams API](https://www.twilio.com/docs/voice/twilio-media-streams)

---

This documentation explains how your Hugging Face strategy works, why you chose batch audio processing after the call instead of risky live streaming, and how to build and use this microservice as part of your AMD stack. Let me know if you want a troubleshooting section or example database mappings added!
