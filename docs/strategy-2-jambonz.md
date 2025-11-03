## Strategy 2 — Twilio + Jambonz SIP AMD

**Goal**: Route calls via Twilio SIP trunk to Jambonz and use Jambonz AMD with tunable parameters for improved accuracy and control.

### Why Jambonz

- Fine-grained AMD configuration (thresholds, timeouts)
- Custom recognizers and post-processing
- Potentially better at long/complex greetings

### Architecture

1. Configure a Twilio SIP trunk to Jambonz SBC domain.
2. For calls with `strategy = 'jambonz'`, dial via SIP URI instead of PSTN.
3. Jambonz flow uses `amd` with parameters and posts results to your webhook (`/api/amd-events`).

### Setup Steps

- Create Jambonz app/flow (cloud trial or self-hosted).
- In Twilio, create a SIP trunk to `JAMBONZ_SIP_DOMAIN`.
- Update Next.js environment:

```
JAMBONZ_SIP_DOMAIN=sip.your-domain.com
JAMBONZ_AMD_WEBHOOK=https://<your-ngrok>/api/amd-events
```

- Dial via SIP (sketch):

```ts
client.calls.create({
  to: `sip:${targetNumber}@${process.env.JAMBONZ_SIP_DOMAIN}`,
  from: process.env.TWILIO_FROM_NUMBER!,
  statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
});
```

### Jambonz AMD Parameters

- Recommended starting point:
  - `thresholdWordCount: 5`
  - `timers.decisionTimeoutMs: 10000`
- Post to webhook events:
  - `amd_human_detected`, `amd_machine_detected`, `amd_timeout`

### Webhook Contract

- `POST /api/amd-events` should accept Jambonz JSON payloads in addition to Twilio.
- Store payloads with `strategy = 'jambonz'` and normalized fields: status, confidence, latency.

### Fallbacks

- If Jambonz is unreachable or SIP error, fall back to Twilio Native AMD automatically.
- Record fallback reason in `CallLog.rawPayload`.

### Tuning Guidance

- Increase `thresholdWordCount` to avoid short-machine false humans.
- Reduce `decisionTimeoutMs` for lower latency when human pickup rates are high.
- Consider language/accent tuning depending on audience.

### Testing Checklist

- Verify SIP route works and Jambonz webhooks reach your ngrok URL.
- 10+ calls: equal mix of voicemail simulations and live human pickups.
- Compare accuracy and P50 latency vs. Twilio Native AMD.
