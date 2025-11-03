## Strategy 4 — Google Gemini 2.5 Flash Live (Planned)

This strategy is not implemented yet. The design below outlines how to add it.

### Concept
Use Gemini 2.5 Flash Live’s real‑time multimodal API to classify human vs. machine during the first 2–3s of audio.

### Proposed Pipeline
1. Twilio Media Streams → Next.js WS proxy → Gemini Live session.
2. Stream raw PCM or linear16 frames to Gemini; prompt with instructions and examples.
3. Maintain rolling decision with tokens budgeted per call.

### Prompting Strategy
- System: “You are an answering machine detector. Respond ONLY with JSON: {label: 'human'|'voicemail', confidence: number 0..1}. Prefer ‘human’ on short single‑word ‘hello’.”
- Few‑shot: examples of machine greetings vs. quick human hellos.
- Noise robustness: instruct to handle background noise and silence.

### Safeguards
- Cap tokens/cost with early termination when high confidence reached.
- Fallback to Hugging Face if Gemini latency > 2.5s or session errors.

### Env
```
GEMINI_API_KEY=...
```

### Risk & Trade‑offs
- Pros: Easy to iterate, flexible reasoning, handles edge cases.
- Cons: Cost, potential hallucination, variable latency. Needs careful prompting and thresholds.

### Testing Plan
- Same voicemail/human matrix; compare to other strategies.
- Track additional metrics: token usage per call and early‑exit rate.
