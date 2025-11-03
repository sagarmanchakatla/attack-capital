import { WebSocketServer } from "ws";
import { IncomingMessage } from "http";

// Global variables to store WebSocket server state
declare global {
  var __nextWss: WebSocketServer | undefined;
  var __audioBuffers: Map<string, Buffer[]> | undefined;
  var __connections: Map<string, WebSocket> | undefined;
}

// Initialize global variables if they don't exist
if (!global.__audioBuffers) {
  global.__audioBuffers = new Map();
}

if (!global.__connections) {
  global.__connections = new Map();
}

export function initializeWebSocket() {
  console.log("🔊 WebSocket server ready for initialization on first request");

  // Return the getter functions for the WebSocket server
  return {
    getConnections: () => global.__connections || new Map(),
    getAudioBuffers: () => global.__audioBuffers || new Map(),
    getWebSocketServer: () => global.__nextWss,
  };
}

// Helper function to process audio with HuggingFace
async function processWithHuggingFace(callSid: string, audioBuffer: Buffer) {
  try {
    console.log(
      `🤖 Sending ${audioBuffer.length} bytes to HuggingFace for ${callSid}`
    );

    const huggingfaceServiceUrl =
      process.env.HUGGINGFACE_SERVICE_URL || "http://localhost:8000";

    const response = await fetch(`${huggingfaceServiceUrl}/predict-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: audioBuffer,
    });

    if (!response.ok) {
      throw new Error(`HuggingFace service error: ${response.status}`);
    }

    const result = await response.json();

    console.log(`🎯 AMD Result for ${callSid}:`, result);

    await handleDetectionResult(callSid, result);
  } catch (error) {
    console.error(`HuggingFace processing error for ${callSid}:`, error);
  }
}

async function handleDetectionResult(callSid: string, result: any) {
  try {
    // Dynamic import to avoid circular dependencies
    const { prisma } = await import("@/lib/db/prisma");

    const call = await prisma.call.findFirst({
      where: { twilioSid: callSid },
    });

    if (!call) {
      console.error(`Call not found for SID: ${callSid}`);
      return;
    }

    await prisma.call.update({
      where: { id: call.id },
      data: {
        detectionResult: result.label,
        confidence: result.confidence,
        humanConfidence: result.human_confidence,
        machineConfidence: result.machine_confidence,
        updatedAt: new Date(),
      },
    });

    // Log the AMD event
    await prisma.callEvent.create({
      callId: call.id,
      eventType: "amd_analysis",
      data: {
        ...result,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(
      `📊 Updated call ${call.id} with AMD result: ${result.label} (${result.confidence})`
    );

    // Handle call based on detection result
    if (result.label === "human" && result.confidence > 0.7) {
      await connectToAgent(callSid);
    } else if (result.label === "machine" && result.confidence > 0.7) {
      await hangUpCall(callSid);
    } else {
      console.log(`❓ Ambiguous result for ${callSid}, keeping call active`);
    }
  } catch (error) {
    console.error(`Error handling detection result for ${callSid}:`, error);
  }
}

async function connectToAgent(callSid: string) {
  try {
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    await client.calls(callSid).update({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/connect-agent`,
    });

    console.log(`✅ Connected call ${callSid} to agent`);
  } catch (error) {
    console.error(`Error connecting agent for ${callSid}:`, error);
  }
}

async function hangUpCall(callSid: string) {
  try {
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    await client.calls(callSid).update({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/hangup-machine`,
    });

    console.log(`✅ Hung up machine call ${callSid}`);
  } catch (error) {
    console.error(`Error hanging up call ${callSid}:`, error);
  }
}

// Export the processing function for use in the API route
export { processWithHuggingFace, handleDetectionResult };
