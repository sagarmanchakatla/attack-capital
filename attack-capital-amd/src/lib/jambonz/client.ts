// lib/jambonz/client.ts
import axios, { AxiosInstance } from "axios";

interface JambonzConfig {
  baseUrl: string;
  apiKey: string;
  accountSid: string;
  applicationSid: string;
}

interface CreateCallPayload {
  application_sid: string;
  from: string;
  to: {
    type: "phone";
    number: string;
  };
  webhook: {
    url: string;
    method: "POST";
  };
  tag?: Record<string, any>;
}

interface CallResponse {
  sid: string;
  call_id: string;
  status: string;
}

/**
 * Jambonz API Client
 * Handles REST API calls to Jambonz platform for call management
 */
export class JambonzClient {
  private client: AxiosInstance;
  private config: JambonzConfig;

  constructor(config: JambonzConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  /**
   * Create an outbound call through Jambonz
   * @param from - Caller ID (Twilio number)
   * @param to - Destination phone number
   * @param webhookUrl - URL for call control webhooks
   * @param metadata - Additional call metadata
   * @returns Call SID and details
   */
  async createCall(
    from: string,
    to: string,
    webhookUrl?: string,
    metadata?: Record<string, any>
  ): Promise<CallResponse> {
    try {
      const payload: CreateCallPayload = {
        application_sid: this.config.applicationSid,
        from,
        to: {
          type: "phone",
          number: to,
        },
        webhook: {
          url: webhookUrl,
          method: "POST",
        },
        ...(metadata && { tag: metadata }),
      };

      console.log("[JambonzClient] Creating call:", {
        from,
        to,
        webhookUrl,
        payload,
      });

      const response = await this.client.post<CallResponse>(
        `/v1/Accounts/${this.config.accountSid}/Calls`,
        payload
      );

      console.log("[JambonzClient] Call created:", response.data);
      return response.data;
    } catch (error) {
      console.error("[JambonzClient] Create call error:", error);
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Jambonz API error: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Get call status and details
   * @param callSid - Jambonz call SID
   */
  async getCallStatus(callSid: string) {
    try {
      const response = await this.client.get(
        `/v1/Accounts/${this.config.accountSid}/Calls/${callSid}`
      );
      return response.data;
    } catch (error) {
      console.error("[JambonzClient] Get call status error:", error);
      throw error;
    }
  }

  /**
   * Hangup an active call
   * @param callSid - Jambonz call SID
   */
  async hangupCall(callSid: string) {
    try {
      const response = await this.client.delete(
        `/v1/Accounts/${this.config.accountSid}/Calls/${callSid}`
      );
      return response.data;
    } catch (error) {
      console.error("[JambonzClient] Hangup call error:", error);
      throw error;
    }
  }

  /**
   * Update call in progress (redirect to new webhook)
   * @param callSid - Jambonz call SID
   * @param webhookUrl - New webhook URL
   */
  async updateCall(callSid: string, webhookUrl: string) {
    try {
      const response = await this.client.post(
        `/v1/Accounts/${this.config.accountSid}/Calls/${callSid}`,
        {
          call_hook: {
            url: webhookUrl,
            method: "POST",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("[JambonzClient] Update call error:", error);
      throw error;
    }
  }
}

/**
 * Create singleton Jambonz client instance
 */
export function createJambonzClient(): JambonzClient {
  const config: JambonzConfig = {
    baseUrl: process.env.JAMBONZ_BASE_URL!,
    apiKey: process.env.JAMBONZ_API_KEY!,
    accountSid: process.env.JAMBONZ_ACCOUNT_SID!,
    applicationSid: process.env.JAMBONZ_APPLICATION_SID!,
  };

  // Validate configuration
  const missing = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Jambonz configuration: ${missing.join(", ")}`);
  }

  return new JambonzClient(config);
}
