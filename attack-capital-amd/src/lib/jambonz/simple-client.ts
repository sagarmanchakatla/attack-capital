// lib/jambonz/simple-client.ts
/**
 * Simplified Jambonz Client using REST API only
 * This bypasses the need for complex SIP trunk setup with Twilio
 * Uses Jambonz's native outbound calling with AMD
 */

import axios from "axios";
import { JAMBONZ_AMD_CONFIG } from "./config";

interface JambonzCallOptions {
  from: string;
  to: string;
  callId: string;
  userId: string;
}

export class SimpleJambonzClient {
  private baseUrl: string;
  private apiKey: string;
  private accountSid: string;
  private applicationSid: string;

  constructor() {
    this.baseUrl = process.env.JAMBONZ_BASE_URL!;
    this.apiKey = process.env.JAMBONZ_API_KEY!;
    this.accountSid = process.env.JAMBONZ_ACCOUNT_SID!;
    this.applicationSid = process.env.JAMBONZ_APPLICATION_SID!;

    // Validate configuration
    if (
      !this.baseUrl ||
      !this.apiKey ||
      !this.accountSid ||
      !this.applicationSid
    ) {
      throw new Error(
        "Missing Jambonz configuration. Please check your .env file."
      );
    }
  }

  /**
   * Initiate outbound call with AMD using Jambonz REST API
   */
  async initiateCall(options: JambonzCallOptions) {
    const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!webhookBaseUrl) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not set. Please configure ngrok URL in .env"
      );
    }

    const payload = {
      application_sid: this.applicationSid,
      from: options.from,
      to: {
        type: "phone",
        number: options.to,
      },
      webhook: {
        url: `${webhookBaseUrl}/api/jambonz/webhooks/call-control`,
        method: "POST",
      },
      tag: {
        callId: options.callId,
        userId: options.userId,
      },
    };

    console.log("[SimpleJambonzClient] Initiating call via REST API:", {
      url: `${this.baseUrl}/v1/Accounts/${this.accountSid}/Calls`,
      payload: {
        ...payload,
        webhook: payload.webhook.url,
      },
    });

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/Accounts/${this.accountSid}/Calls`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 15000, // 15 second timeout
        }
      );

      console.log("[SimpleJambonzClient] Call initiated successfully:", {
        sid: response.data.sid,
        call_id: response.data.call_id,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("[SimpleJambonzClient] API Error:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });

        // Provide helpful error messages
        if (error.response?.status === 401) {
          throw new Error("Jambonz authentication failed. Check your API key.");
        } else if (error.response?.status === 404) {
          throw new Error(
            "Jambonz account or application not found. Check your SIDs."
          );
        } else if (error.response?.status === 400) {
          throw new Error(
            `Jambonz API error: ${
              error.response?.data?.message || "Invalid request"
            }`
          );
        }

        throw new Error(
          error.response?.data?.message ||
            error.message ||
            "Failed to initiate call via Jambonz"
        );
      }

      console.error("[SimpleJambonzClient] Unknown error:", error);
      throw error;
    }
  }

  /**
   * Generate initial Jambonz application payload
   * This is what gets returned from the webhook when Jambonz first connects
   */
  static generateInitialPayload(callId: string) {
    const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_URL;

    return [
      {
        verb: "config",
        amd: {
          actionHook: `${webhookBaseUrl}/api/jambonz/webhooks/amd-events?callId=${callId}`,
          thresholdWordCount: JAMBONZ_AMD_CONFIG.thresholdWordCount,
          digitCount: JAMBONZ_AMD_CONFIG.digitCount,
          timers: JAMBONZ_AMD_CONFIG.timers,
        },
      },
      {
        verb: "say",
        text: "Connecting your call, please wait.",
        synthesizer: {
          vendor: "google",
          language: "en-US",
        },
      },
    ];
  }

  /**
   * Generate payload for human detection
   */
  static generateHumanDetectedPayload() {
    return [
      {
        verb: "say",
        text: "Hello! A human has been detected. This is a test call from the AMD system.",
        synthesizer: {
          vendor: "google",
          language: "en-US",
        },
      },
      {
        verb: "pause",
        length: 2,
      },
      {
        verb: "hangup",
      },
    ];
  }

  /**
   * Generate payload for machine detection
   */
  static generateMachineDetectedPayload() {
    return [
      {
        verb: "hangup",
        reason: "Machine detected - voicemail",
      },
    ];
  }

  /**
   * Generate payload for undecided/timeout
   */
  static generateUndecidedPayload() {
    return [
      {
        verb: "say",
        text: "Unable to determine if human or machine. Hanging up.",
        synthesizer: {
          vendor: "google",
          language: "en-US",
        },
      },
      {
        verb: "hangup",
      },
    ];
  }
}
