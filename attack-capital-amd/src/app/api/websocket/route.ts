import { NextRequest } from "next/server";
import { WebSocketServer } from "ws";
import { NextResponse } from "next/server";
import { IncomingMessage } from "http";
import { headers } from "next/headers";

// Store WebSocket connections and audio buffers
const connections = new Map();
const audioBuffers = new Map();

// Create WebSocket server (singleton)
let wss: WebSocketServer | null = null;

function initializeWebSocketServer() {
  if (wss) return wss;

  // @ts-ignore - We're attaching to the global server
  const server = global.__nextServer;

  if (!server) {
    console.error("Next.js server not available for WebSocket attachment");
    return null;
  }

  wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, request: IncomingMessage) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const callSid = url.searchParams.get("callSid");

    console.log(`🔊 WebSocket connected for call: ${callSid}`);

    if (!callSid) {
      ws.close(1008, "Missing callSid");
      return;
    }

    // Store connection
    connections.set(callSid, ws);
    audioBuffers.set(callSid, []);

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.event === "media" && message.media) {
          await handleAudioChunk(callSid, message.media.payload);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      console.log(`🔊 WebSocket disconnected for call: ${callSid}`);
      connections.delete(callSid);
      audioBuffers.delete(callSid);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for call ${callSid}:`, error);
    });
  });

  // Handle upgrade requests
  server.on(
    "upgrade",
    (request: IncomingMessage, socket: any, head: Buffer) => {
      if (request.url?.startsWith("/api/websocket")) {
        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit("connection", ws, request);
        });
      }
    }
  );

  console.log("🔊 WebSocket server initialized");
  return wss;
}

async function handleAudioChunk(callSid: string, payload: string) {
  try {
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(payload, "base64");

    // Add to buffer
    const buffers = audioBuffers.get(callSid) || [];
    buffers.push(audioBuffer);

    console.log(
      `🎯 Audio chunk for ${callSid}, buffer size: ${buffers.length}`
    );

    // Process every 2 seconds of audio
    if (buffers.length >= 4) {
      const combinedBuffer = Buffer.concat(buffers);

      // Send to HuggingFace service
      await processWithHuggingFace(callSid, combinedBuffer);

      // Clear buffer after processing
      audioBuffers.set(callSid, []);
    }
  } catch (error) {
    console.error(`Audio processing error for ${callSid}:`, error);
  }
}

async function processWithHuggingFace(callSid: string, audioBuffer: Buffer) {
  try {
    console.log(`🤖 Sending audio to HuggingFace for ${callSid}`);

    // Call your HuggingFace service
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

    // Handle the detection result
    await handleDetectionResult(callSid, result);
  } catch (error) {
    console.error(`HuggingFace processing error for ${callSid}:`, error);
  }
}

async function handleDetectionResult(callSid: string, result: any) {
  try {
    // Update call in database
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
      },
    });

    // Log the AMD event
    await prisma.callEvent.create({
      callId: call.id,
      eventType: "amd_analysis",
      data: result,
    });

    // Handle call based on detection result
    if (result.label === "human" && result.confidence > 0.7) {
      await connectToAgent(callSid);
    } else if (result.label === "machine" && result.confidence > 0.7) {
      await hangUpCall(callSid);
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

export async function GET(request: NextRequest) {
  try {
    // Initialize WebSocket server on first request
    initializeWebSocketServer();

    return NextResponse.json({
      status: "ready",
      message: "WebSocket server is running",
      connections: connections.size,
    });
  } catch (error) {
    console.error("WebSocket API error:", error);
    return NextResponse.json(
      { error: "WebSocket setup failed" },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function POST(request: NextRequest) {
  return NextResponse.json({
    status: "healthy",
    connections: connections.size,
    activeCalls: Array.from(connections.keys()),
  });
}
