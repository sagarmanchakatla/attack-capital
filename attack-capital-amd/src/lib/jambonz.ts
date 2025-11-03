export async function jambonzApiInitiateCall({
  from,
  to,
  callbackUrl,
  callId,
}) {
  const payload = {
    from,
    to,
    application_sid: process.env.JAMBONZ_APP_SID!,
    amd: {
      enable: true,
      thresholdWordCount: 5,
      timers: { decisionTimeoutMs: 10000 },
    },
    webhook: callbackUrl,
    userData: { callId },
  };

  // Real implementation: Jambonz cloud REST endpoint
  const result = await fetch(`${process.env.JAMBONZ_API_BASE_URL}/v1/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).then((res) => res.json());

  return result;
}
