import { NextRequest } from "next/server";
import { WebSocketServer } from "ws";
import { NextResponse } from "next/server";

// This is needed for WebSocket in Next.js
export const runtime = "nodejs";

// Store WebSocket connections
const connections = new Map();

export async function GET(request: NextRequest) {
  try {
    const callSid = request.nextUrl.searchParams.get("callSid");

    if (!callSid) {
      return NextResponse.json({ error: "Missing callSid" }, { status: 400 });
    }

    // This endpoint is called by Twilio to establish WebSocket connection
    // The actual WebSocket handling happens in our WebSocket server

    return NextResponse.json({
      status: "ready",
      callSid,
      message: "WebSocket endpoint ready for Twilio Media Streams",
    });
  } catch (error) {
    console.error("WebSocket API error:", error);
    return NextResponse.json(
      { error: "WebSocket setup failed" },
      { status: 500 }
    );
  }
}
