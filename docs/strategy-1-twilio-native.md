## Strategy 1 — Twilio Native AMD

**Goal**: Use Twilio's built‑in AMD to classify human vs. machine at call answer.

### Pipeline

1. Next.js creates outbound call via Twilio REST `calls.create` with `machineDetection: 'Enable'` or `machineDetection: 'DetectMessageEnd'`.
2. Twilio invokes `StatusCallback` webhooks (answer, AMD events, completed).
3. Backend updates `CallLog` with AMD result and timing; UI updates live status.
4. If human → connect to live session; if machine → hang up and log.

### Setup

- Ensure `.env` contains:

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_STATUS_CALLBACK_URL=https://<your-ngrok>/api/amd-events
```

- Expose Next.js over HTTPS (ngrok).

### Call Creation (sketch)

```ts
client.calls.create({
  to: targetNumber,
  from: process.env.TWILIO_FROM_NUMBER!,
  url: `${APP_URL}/api/twiml/answer`,
  statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
  statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  machineDetection: "Enable", // or 'DetectMessageEnd'
  machineDetectionTimeout: 10, // seconds
});
```

Twilio will emit `AnsweringMachineDetectionStatus` with values like `human`, `machine_start`, `machine_end_beep`.

### Webhooks

- `POST /api/amd-events` handles Twilio form-encoded payloads:
  - `CallSid`, `CallStatus`, `AnsweredBy`, `AnsweringMachineDetectionStatus`, `Timestamp`
- Validate payloads; verify origin via Twilio signature.
- Persist to `CallLog` with `strategy = 'twilio'`.

### Tuning

- `Enable` vs `DetectMessageEnd`:
  - `Enable` yields earlier but potentially less accurate decisions.
  - `DetectMessageEnd` waits for the voicemail beep; higher accuracy for machine, higher latency.
- Increase `machineDetectionTimeout` (8–12s) when long greetings are common.
- When in doubt, set policy: if undecided in 3s, route as human but keep listening.

### Trial Account Caveats

- Trial message plays at call start and requires a DTMF key press to dismiss. This delays AMD and may cause false reads.
- Options:
  - Use a paid account for benchmarking.
  - In TwiML `answer` flow, `Gather` a single digit immediately to dismiss the prompt, then start AMD. Expect added latency.

### Failure Modes & Handling

- `no-answer/busy/failed`: log `status = 'no_answer'` and end.
- `AMD undecided`: mark `status = 'undecided'`, continue listening up to 10s, then default policy.
- `Webhook retries`: ensure idempotent upserts on `CallSid`.

### Metrics to Track

- Time to first AMD decision (ms)
- Final decision accuracy vs. manual labels
- False human (worst) vs. false machine

### Testing Checklist

- 5× calls each to Costco/Nike/PayPal voicemail numbers
- 5× calls to a human who says “hello” within 1s
- Verify webhook logging and UI status transitions
- Export CSV and compute accuracy/latency
