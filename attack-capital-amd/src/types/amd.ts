export type AMDStrategy =
  | "twilio-native"
  | "jambonz"
  | "huggingface"
  | "gemini";

export type DetectionResult = "human" | "machine" | "undecided" | "failed";

export type CallStatus =
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "failed"
  | "busy"
  | "no-answer";

export interface AMDResult {
  label: DetectionResult;
  confidence: number;
  latency: number; // milliseconds
  metadata?: Record<string, any>;
}

export interface CallData {
  id: string;
  phoneNumber: string;
  amdStrategy: AMDStrategy;
  detectionResult?: DetectionResult;
  confidence?: number;
  status: CallStatus;
  twilioSid: string;
  createdAt: string;
  duration?: number;
}

export interface DialRequest {
  phoneNumber: string;
  amdStrategy: AMDStrategy;
}
