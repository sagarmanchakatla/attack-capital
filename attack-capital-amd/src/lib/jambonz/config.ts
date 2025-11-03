// // export interface JambonzConfig {
// //   baseUrl: string;
// //   accountSid: string;
// //   apiKey: string;
// //   sipDomain: string;
// //   amdConfig: {
// //     enabled: boolean;
// //     thresholdWordCount: number;
// //     decisionTimeoutMs: number;
// //     silenceThreshold: number;
// //   };
// // }

// // export const JAMBONZ_CONFIG: JambonzConfig = {
// //   baseUrl: process.env.JAMBONZ_BASE_URL || "https://jambonz.cloud",
// //   accountSid: process.env.JAMBONZ_ACCOUNT_SID!,
// //   apiKey: process.env.JAMBONZ_API_KEY!,
// //   sipDomain: process.env.JAMBONZ_SIP_DOMAIN!,
// //   amdConfig: {
// //     enabled: true,
// //     thresholdWordCount: 3,
// //     decisionTimeoutMs: 8000,
// //     silenceThreshold: 800,
// //   },
// // };

// export interface JambonzConfig {
//   sipDomain: string;
//   amdConfig: {
//     enabled: boolean;
//     thresholdWordCount: number;
//     decisionTimeoutMs: number;
//     silenceThreshold: number;
//     afterGreetingSilence: number;
//     maximumWordLength: number;
//     totalAnalysisTime: number;
//     betweenWordsSilence: number;
//   };
// }

// export const JAMBONZ_CONFIG: JambonzConfig = {
//   sipDomain: process.env.JAMBONZ_SIP_DOMAIN || "sagar.sip.jambonz.cloud",
//   amdConfig: {
//     enabled: true,
//     thresholdWordCount: 3,
//     decisionTimeoutMs: 8000,
//     silenceThreshold: 800,
//     afterGreetingSilence: 500,
//     maximumWordLength: 5000,
//     totalAnalysisTime: 10000,
//     betweenWordsSilence: 200,
//   },
// };

// lib/jambonz/config.ts

/**
 * Jambonz AMD Configuration
 * Tuned parameters based on documentation and testing
 */
export const JAMBONZ_AMD_CONFIG = {
  // Number of words to trigger machine detection (default: 9, tuned: 5)
  thresholdWordCount: 5,

  // Number of digits to trigger machine detection (0 = off, 5-6 for UK numbers)
  digitCount: 6,

  // Timing configurations
  timers: {
    // Max time to make decision before timeout (default: 15000ms)
    decisionTimeoutMs: 10000,

    // Silence duration to detect end of greeting (default: 2000ms)
    greetingCompletionTimeoutMs: 2000,

    // Time to wait for speech before no-speech event (default: 5000ms)
    noSpeechTimeoutMs: 5000,

    // Time to wait for tone/beep (default: 20000ms)
    toneTimeoutMs: 20000,
  },
};

/**
 * Jambonz AMD Event Types
 */
export enum JambonzAMDEventType {
  HUMAN_DETECTED = "amd_human_detected",
  MACHINE_DETECTED = "amd_machine_detected",
  NO_SPEECH = "amd_no_speech_detected",
  DECISION_TIMEOUT = "amd_decision_timeout",
  MACHINE_STOPPED = "amd_machine_stopped_speaking",
  TONE_DETECTED = "amd_tone_detected",
  ERROR = "amd_error",
  STOPPED = "amd_stopped",
}

/**
 * Jambonz AMD Event Payload
 */
export interface JambonzAMDEvent {
  type: JambonzAMDEventType;
  reason?: string;
  greeting?: string;
  hint?: string;
  transcript?: string;
  language?: string;
  error?: string;
  call_sid?: string;
  from?: string;
  to?: string;
  direction?: string;
  call_id?: string;
}

/**
 * Jambonz Verb Types
 */
export type JambonzVerb =
  | DialVerb
  | HangupVerb
  | SayVerb
  | PlayVerb
  | GatherVerb
  | PauseVerb
  | ConfigVerb;

export interface DialVerb {
  verb: "dial";
  actionHook?: string;
  callerId?: string;
  target: Array<{
    type: "phone" | "sip" | "user";
    number?: string;
    sipUri?: string;
    name?: string;
  }>;
  amd?: {
    actionHook: string;
    recognizer?: Record<string, any>;
    thresholdWordCount?: number;
    digitCount?: number;
    timers?: {
      decisionTimeoutMs?: number;
      greetingCompletionTimeoutMs?: number;
      noSpeechTimeoutMs?: number;
      toneTimeoutMs?: number;
    };
  };
  timeLimit?: number;
  timeout?: number;
  answerOnBridge?: boolean;
}

export interface HangupVerb {
  verb: "hangup";
  reason?: string;
}

export interface SayVerb {
  verb: "say";
  text: string;
  synthesizer?: {
    vendor: "google" | "aws" | "microsoft" | "wellsaid" | "elevenlabs";
    language?: string;
    voice?: string;
  };
  loop?: number;
}

export interface PlayVerb {
  verb: "play";
  url: string;
  loop?: number;
  timeoutSecs?: number;
}

export interface GatherVerb {
  verb: "gather";
  actionHook: string;
  input: ("digits" | "speech")[];
  bargein?: boolean;
  dtmfBargein?: boolean;
  finishOnKey?: string;
  numDigits?: number;
  timeout?: number;
  recognizer?: Record<string, any>;
  say?: {
    text: string;
    synthesizer?: Record<string, any>;
  };
  play?: {
    url: string;
  };
}

export interface PauseVerb {
  verb: "pause";
  length: number;
}

export interface ConfigVerb {
  verb: "config";
  amd?: {
    actionHook: string;
    recognizer?: Record<string, any>;
    thresholdWordCount?: number;
    digitCount?: number;
    timers?: Record<string, number>;
  };
  record?: Record<string, any>;
  transcribe?: Record<string, any>;
}

/**
 * Jambonz webhook call data
 */
export interface JambonzCallData {
  call_sid: string;
  call_id: string;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  call_status:
    | "trying"
    | "ringing"
    | "early"
    | "in-progress"
    | "completed"
    | "failed"
    | "busy"
    | "no-answer";
  sip_status?: number;
  originating_sip_ip?: string;
  originating_sip_trunk_name?: string;
  api_base_url?: string;
}

/**
 * Common voicemail greeting phrases (for reference)
 */
export const VOICEMAIL_PHRASES = {
  "en-US": [
    "call has been forwarded",
    "at the beep",
    "at the tone",
    "leave a message",
    "leave me a message",
    "not available right now",
    "not available to take your call",
    "can't take your call",
    "I will get back to you",
    "I'll get back to you",
    "we will get back to you",
    "we are unable",
    "we are not available",
    "please leave your name",
    "after the tone",
    "unavailable at the moment",
  ],
};

/**
 * Map Jambonz AMD events to database detection results
 */
export function mapAMDEventToResult(eventType: JambonzAMDEventType): string {
  switch (eventType) {
    case JambonzAMDEventType.HUMAN_DETECTED:
      return "human";
    case JambonzAMDEventType.MACHINE_DETECTED:
    case JambonzAMDEventType.TONE_DETECTED:
    case JambonzAMDEventType.MACHINE_STOPPED:
      return "machine";
    case JambonzAMDEventType.NO_SPEECH:
    case JambonzAMDEventType.DECISION_TIMEOUT:
      return "undecided";
    case JambonzAMDEventType.ERROR:
      return "failed";
    default:
      return "undecided";
  }
}

/**
 * Generate confidence score based on AMD event
 */
export function calculateConfidence(event: JambonzAMDEvent): number {
  switch (event.type) {
    case JambonzAMDEventType.HUMAN_DETECTED:
      // High confidence if reason is "short greeting"
      return event.reason === "short greeting" ? 0.95 : 0.85;

    case JambonzAMDEventType.MACHINE_DETECTED:
      // High confidence if hint matched
      return event.hint ? 0.95 : 0.85;

    case JambonzAMDEventType.TONE_DETECTED:
      // Very high confidence - beep is strong indicator
      return 0.98;

    case JambonzAMDEventType.MACHINE_STOPPED:
      // High confidence - full greeting played
      return 0.9;

    case JambonzAMDEventType.NO_SPEECH:
      // Low confidence - could be network issue
      return 0.5;

    case JambonzAMDEventType.DECISION_TIMEOUT:
      // Very low confidence - couldn't decide
      return 0.3;

    case JambonzAMDEventType.ERROR:
      return 0.0;

    default:
      return 0.5;
  }
}
