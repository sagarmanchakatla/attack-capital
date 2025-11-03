# Attack Capital — Advanced Answering Machine Detection (AMD)

A secure, scalable Next.js application for outbound calling with multi‑strategy Answering Machine Detection. On answer, the system classifies human vs. machine in under ~3s and either connects a live session (human) or hangs up/logs (machine). Strategies include Twilio Native AMD, Twilio+Jambonz SIP AMD, and a Python Hugging Face model service. A fourth strategy (Gemini 2.5 Flash Live) is designed but not yet implemented in this repo.

> Note on Twilio Trial: Trial accounts must verify every destination phone number and play a pre‑recorded trial message that requires a key press to proceed. This adds latency and interferes with AMD (especially Strategy 1). See Known Limitations.

---

## Features

- AMD Strategies selectable in UI: Twilio Native, Twilio+Jambonz, Hugging Face (Gemini: planned)
- Low‑latency streaming pipelines (Twilio Media Streams → WebSocket → inference)
- Postgres logging via Prisma (call, strategy, outcome, timings, confidence)
- Authentication via Better‑Auth
- Webhook‑safe backend (input validation, rate limiting, HTTPS required)
- Developer ergonomics: ESLint/Prettier, TypeDoc/JSDoc, Docker for Python service

---

## Architecture

```mermaid
flowchart LR
  subgraph Client [Next.js 14 (App Router)]
    UI[Dial UI\nStrategy Dropdown]\n
    WS[Live Call View\nStatus, Logs]
  end

  subgraph NextAPI [Next.js API Routes]
    Dial[/api/dial\n(create call)/]
    AmdEvt[/api/amd-events\n(Twilio/Jambonz webhooks)/]
    StreamProxy[/api/stream\n(Twilio Media Streams proxy)/]
  end

  Client -->|Dial: number+strategy| Dial
  Dial -->|Twilio REST API| TwilioVoice[(Twilio Voice)]
  TwilioVoice -->|Status/AMD callbacks| AmdEvt
  TwilioVoice <-->|Media Streams (WS)| StreamProxy

  subgraph AMD [AMD Engines]
    TwAMD[Twilio Native AMD]
    Jambonz[Jambonz SIP AMD]
    HF[Hugging Face FastAPI\npython-service]
    Gemini[(Gemini 2.5 Flash Live)\nPlanned]
  end

  StreamProxy -->|PCM chunks| HF
  TwilioVoice -->|SIP trunk| Jambonz

  subgraph DB [Postgres]
    Prisma[(Prisma ORM)]
  end

  NextAPI <-->|read/write| Prisma
  AmdEvt --> Prisma
  StreamProxy --> Prisma
```

---

## Repo Structure

- `app/` — Next.js App Router (UI + API routes) [not shown in this snippet]
- `lib/amdStrategies.ts` — AMD strategy factory/orchestration (planned location)
- `prisma/` — Prisma schema and migrations
- `python-service/` — FastAPI Hugging Face inference service
  - `app/main.py` — Wav2Vec2 model inference endpoints
- `docs/` — Strategy docs and deep dives

---

## Quick Start

### Prerequisites

- Node 18+ (or 20+), pnpm or npm
- Python 3.10+
- Docker (for Postgres or optional for python-service)
- Postgres 14+ (local or Docker)
- ngrok (or HTTPS tunnel) for local webhooks
- Twilio account (trial OK; see limitations)

### Environment Variables

Create `.env` in the Next.js project root:

```
# Next.js App
NEXT_PUBLIC_APP_URL=https://your-ngrok-domain.ngrok.io

# Auth
BETTER_AUTH_SECRET=replace_me

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/attack_capital?schema=public

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_STATUS_CALLBACK_URL=${NEXT_PUBLIC_APP_URL}/api/amd-events
TWILIO_MEDIA_STREAM_WS=${NEXT_PUBLIC_APP_URL}/api/stream

# Jambonz (optional)
JAMBONZ_SIP_DOMAIN=sip.your-domain.com
JAMBONZ_AMD_WEBHOOK=${NEXT_PUBLIC_APP_URL}/api/amd-events

# Hugging Face Python Service
HF_SERVICE_URL=http://localhost:8000
```

For the Python service, you can also create `python-service/.env` if needed (not required by default).

### Database Setup (Postgres + Prisma)

1. Start Postgres (example via Docker):
   ```bash
   docker run --name pg-attack -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14
   ```
2. Install deps and generate Prisma client:
   ```bash
   pnpm install # or npm install
   pnpm prisma migrate dev
   pnpm prisma generate
   ```

Suggested Prisma model (high-level) — actual schema may differ:

```sql
model CallLog {
  id              String   @id @default(cuid())
  userId          String
  toNumber        String
  fromNumber      String
  strategy        String   // 'twilio' | 'jambonz' | 'huggingface' | 'gemini'
  status          String   // 'human' | 'machine' | 'undecided' | 'error' | 'no_answer'
  confidence      Float?
  latencyMs       Int?
  attempt         Int      @default(1)
  rawPayload      Json?
  createdAt       DateTime @default(now())
}
```

### Python Service (Hugging Face) — Local Dev

Run directly:

```bash
cd python-service/app
pip install -r ../requirements.txt  # if present; else install: fastapi uvicorn torch transformers librosa numpy
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Or via Docker (example):

```bash
docker build -t attack-capital-hf python-service
docker run --rm -p 8000:8000 attack-capital-hf
```

Expose locally via ngrok for Next.js if needed:

```bash
ngrok http 8000
```

### Next.js App — Dev

```bash
pnpm dev
```

Expose the app for Twilio webhooks:

```bash
ngrok http 3000
```

Update `.env` URLs to the ngrok domain and restart dev.

---

## AMD Strategies

- Strategy 1: Twilio Native AMD — baseline using `machineDetection: 'Enable'` or `detect-message-end`
  - Doc: `docs/strategy-1-twilio-native.md`
- Strategy 2: Twilio + Jambonz SIP AMD — SIP trunk to Jambonz with configurable AMD params
  - Doc: `docs/strategy-2-jambonz.md`
- Strategy 3: Hugging Face (Python) — Wav2Vec2 inference via `/predict` and `/predict-stream`
  - Doc: `docs/strategy-3-huggingface.md`
- Strategy 4: Gemini 2.5 Flash Live — Design present; not yet implemented
  - Doc: `docs/strategy-4-gemini.md`

A factory creates the correct engine based on selection:

```ts
// lib/amdStrategies.ts (planned sketch)
export type Strategy = "twilio" | "jambonz" | "huggingface" | "gemini";
export function createDetector(strategy: Strategy) {
  /* returns { start, onChunk, finalize } */
}
```

---

## Python Service API (Hugging Face)

- `POST /predict` — body: audio file (2–5s). Returns `{ label: 'human'|'voicemail', confidence, processing_time_ms, model_info }`
- `POST /predict-stream` — same payload contract (for chunk mode)
- `GET /health`, `GET /model-info`

The bundled service loads `jakeBland/wav2vec-vm-finetune`, normalizes audio to 16kHz mono, and infers on GPU if available.

---

## Calling Flow & UI

1. Authenticated user selects strategy and target number, then clicks Dial.
2. Backend creates Twilio call (or routes via SIP/Jambonz) and sets media/webhook URLs.
3. On answer:
   - Strategy performs AMD. If human → connect to live session UI and keep streaming; if machine → hang up and log.
4. Results are logged in Postgres with latency, confidence, and payloads.

UI shows real‑time status: dialing → ringing → answered → human/machine decision → action.

---

## Testing & Validation

Target numbers (voicemail simulations):

- Costco: 1-800-774-2678
- Nike: 1-800-806-6453
- PayPal: 1-888-221-1161

Scenarios:

- Voicemail (greeting > 5 words) → expect machine; hangup + log
- Human pickup (say “hello” quickly) → expect human; connect stream
- Timeout (3s silence) → treat as human (undecided policy)
- Low confidence (< 0.7) → retry once (max 2x); log warning and allow user override

Record ≥10 calls per strategy; export CSV from history. Track false positives/negatives.

---

## Comparison (Fill with your results)

| Strategy         | Accuracy (machine) | Accuracy (human) | P50 Latency | Cost | Notes                                        |
| ---------------- | -----------------: | ---------------: | ----------: | ---: | -------------------------------------------- |
| Twilio Native    |                TBD |              TBD |         TBD |    $ | Trial message hurts latency/accuracy         |
| Jambonz SIP      |                TBD |              TBD |         TBD |   $$ | Customizable thresholds and timers           |
| Hugging Face     |                TBD |              TBD |         TBD |    $ | ONNX export can reduce latency               |
| Gemini (Planned) |                TBD |              TBD |         TBD |   $$ | Hallucination risks; robust prompts required |

---

## Security

- Validate inputs with Zod on API routes (numbers, strategy, webhook payloads)
- Rate limit public endpoints (e.g., Upstash)
- Enforce HTTPS for webhooks (use ngrok in dev)
- Store only necessary payload fields; redact PII
- Principle of least privilege for Twilio keys and DB creds

---

## Known Limitations

- Twilio Trial Accounts:

  - Must verify every destination number before calling
  - Twilio plays a trial message on connect and requires a key press to dismiss
  - This delays AMD and can cause misclassification, especially for Twilio Native AMD (Strategy 1)
  - Recommendation: Use a paid account for accurate benchmarking, or pre‑record/tune flows that wait out the trial prompt before AMD

- Strategy 4 (Gemini) not implemented yet; design is included for future work

---

## Roadmap

- Implement Gemini Live strategy with streaming bi‑directional audio and cost caps
- Export HF model to ONNX and enable attention optimizations for low‑latency CPU paths
- Add comprehensive history view with CSV export, filters, and metrics
- Add per‑user rate limits and org multi‑tenancy

---

## License

MIT (or per repository root).
