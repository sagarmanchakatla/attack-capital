import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;

export const twilioClient = twilio(accountSid, authToken);
export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

// Validate webhook signature for security
export function validateTwilioRequest(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, any>
): boolean {
  return twilio.validateRequest(authToken, twilioSignature, url, params);
}

// Single AMD Configuration for Twilio Native AMD
export const TWILIO_AMD_CONFIG = {
  // Core AMD parameters
  machineDetection: "Enable" as const,
  asyncAmd: true,
  // asyncAmdStatusCallback: `${process.env.BASE_URL}/api/webhooks/twilio/amd-status`,
  asyncAmdStatusCallbackMethod: "POST" as const,

  // Optimized tuning parameters
  machineDetectionTimeout: 12,
  machineDetectionSpeechThreshold: 2000,
  machineDetectionSpeechEndThreshold: 1000,
  machineDetectionSilenceTimeout: 4000,
};
