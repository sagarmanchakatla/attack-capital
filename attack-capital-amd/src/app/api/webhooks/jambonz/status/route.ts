// app/api/jambonz/webhooks/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/jambonz/webhooks/status
 *
 * This webhook receives call status updates from Jambonz
 * Used for tracking call progress and final disposition
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("[Jambonz Status] Webhook received:", body);

    const { call_sid, call_status, duration, tag } = body;
    const callId = tag?.callId;

    if (!callId) {
      console.warn("[Jambonz Status] No callId in tag");
      return NextResponse.json({ received: true });
    }

    // Find the call
    const call = await prisma.call.findUnique({
      where: { id: callId },
    });

    if (!call) {
      console.error("[Jambonz Status] Call not found:", callId);
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Update call status
    const updates: any = {
      status: call_status,
    };

    // Set completion time for terminal states
    if (["completed", "failed", "busy", "no-answer"].includes(call_status)) {
      updates.completedAt = new Date();
    }

    // Set duration if provided
    if (duration !== undefined) {
      updates.duration = Math.floor(duration);
    }

    await prisma.call.update({
      where: { id: callId },
      data: updates,
    });

    // Create status event
    await prisma.callEvent.create({
      data: {
        callId,
        eventType: call_status,
        data: {
          call_sid,
          call_status,
          duration,
          timestamp: new Date().toISOString(),
        },
      },
    });

    console.log("[Jambonz Status] Call updated:", {
      callId,
      status: call_status,
      duration,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Jambonz Status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
