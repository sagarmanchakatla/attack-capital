import { WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { huggingfaceClient } from "./huggingface/client";

interface MediaStreamMessage {
  event: "media" | "mark" | "clear";
  sequenceNumber?: string;
  media?: {
    payload: string;
  };
  streamSid?: string;
}

export class AudioWebSocketServer {
  private wss: WebSocketServer;
  private audioBuffers: Map<string, Buffer[]> = new Map();

  constructor(port: number = 8081) {
    this.wss = new WebSocketServer({ port });
    this.setupWebSocket();
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws, request: IncomingMessage) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const callSid = url.searchParams.get("callSid");

      console.log(`🔊 WebSocket connected for call: ${callSid}`);

      if (!callSid) {
        ws.close(1008, "Missing callSid");
        return;
      }

      // Initialize audio buffer for this call
      this.audioBuffers.set(callSid, []);

      ws.on("message", async (data: Buffer) => {
        try {
          const message: MediaStreamMessage = JSON.parse(data.toString());

          if (message.event === "media" && message.media) {
            await this.handleAudioChunk(callSid, message.media.payload);
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });

      ws.on("close", () => {
        console.log(`🔊 WebSocket disconnected for call: ${callSid}`);
        this.audioBuffers.delete(callSid);
      });

      ws.on("error", (error) => {
        console.error(`WebSocket error for call ${callSid}:`, error);
      });
    });
  }

  private async handleAudioChunk(callSid: string, payload: string) {
    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(payload, "base64");

      // Add to buffer
      const buffers = this.audioBuffers.get(callSid) || [];
      buffers.push(audioBuffer);

      // Process every 2 seconds of audio (approx 32KB chunks at 8kHz)
      if (buffers.length >= 4) {
        // Adjust based on your needs
        const combinedBuffer = Buffer.concat(buffers);

        // Send to HuggingFace service
        const result = await huggingfaceClient.predictAudio(combinedBuffer);

        console.log(`🎯 AMD Result for ${callSid}:`, result);

        // Handle detection result
        await this.handleDetectionResult(callSid, result);

        // Clear buffer after processing
        this.audioBuffers.set(callSid, []);
      }
    } catch (error) {
      console.error(`Audio processing error for ${callSid}:`, error);
    }
  }

  private async handleDetectionResult(callSid: string, result: any) {
    // Update call in database
    const { prisma } = await import("@/lib/db/prisma");

    await prisma.call.update({
      where: { twilioSid: callSid },
      data: {
        detectionResult: result.label,
        confidence: result.confidence,
        humanConfidence: result.human_confidence,
        machineConfidence: result.machine_confidence,
      },
    });

    // Log the AMD event
    await prisma.callEvent.create({
      callId: (await prisma.call.findFirst({ where: { twilioSid: callSid } }))!
        .id,
      eventType: "amd_analysis",
      data: result,
    });

    // Here you would typically use Twilio REST API to update the call
    // based on the detection result (connect agent or hang up)
    if (result.label === "human" && result.confidence > 0.7) {
      await this.connectToAgent(callSid);
    } else if (result.label === "machine" && result.confidence > 0.7) {
      await this.hangUpCall(callSid);
    }
  }

  private async connectToAgent(callSid: string) {
    // Use Twilio REST API to redirect call to agent
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.calls(callSid).update({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/connect-agent`,
    });
  }

  private async hangUpCall(callSid: string) {
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.calls(callSid).update({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/hangup-machine`,
    });
  }
}

// Start WebSocket server
export const audioWebSocketServer = new AudioWebSocketServer();
