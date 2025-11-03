import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { twilioClient } from "@/lib/twilio/client";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData);

    const { CallSid, AnsweredBy, MachineDetectionDuration, CallStatus } =
      params;

    console.log("🔔 AMD Webhook - Raw Data:", {
      CallSid,
      AnsweredBy,
      MachineDetectionDuration,
      CallStatus,
    });

    // Find call
    const call = await prisma.call.findFirst({
      where: { twilioSid: CallSid as string },
    });

    if (!call) {
      console.error("Call not found:", CallSid);
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const detectionDuration = MachineDetectionDuration
      ? parseInt(MachineDetectionDuration as string)
      : 0;

    // SIMPLE & RELIABLE DETECTION LOGIC
    let detectionResult: "human" | "machine" | "undecided" = "undecided";
    let confidence = 0.5;

    // Trust Twilio's detection completely
    if (AnsweredBy === "human") {
      detectionResult = "human";
      confidence = 0.95;
      console.log(`✅ HUMAN DETECTED: ${detectionDuration}ms`);
    } else if (
      AnsweredBy === "machine_start" ||
      AnsweredBy === "machine_end_beep"
    ) {
      detectionResult = "machine";
      confidence = 0.95;
      console.log(`🤖 MACHINE DETECTED: ${detectionDuration}ms`);
    } else if (AnsweredBy === "fax") {
      detectionResult = "machine";
      confidence = 0.99;
      console.log(`📠 FAX DETECTED: ${detectionDuration}ms`);
    } else {
      // For 'unknown' or any other value
      detectionResult = "undecided";
      confidence = 0.5;
      console.log(`❓ UNKNOWN: ${AnsweredBy} (${detectionDuration}ms)`);
    }

    // Update call with AMD result
    await prisma.call.update({
      where: { id: call.id },
      data: {
        detectionResult,
        confidence,
        latency: detectionDuration,
        amdStatus: AnsweredBy as string,
        updatedAt: new Date(),
      },
    });

    // Log AMD event
    await prisma.callEvent.create({
      data: {
        callId: call.id,
        eventType: "amd_completed",
        data: {
          answeredBy: AnsweredBy,
          detectionResult,
          confidence,
          latency: detectionDuration,
          callStatus: CallStatus,
        },
      },
    });

    console.log(`📊 Final Result: ${detectionResult} (${confidence})`);

    // ONLY hang up on confirmed machines
    if (detectionResult === "machine" && CallStatus !== "completed") {
      try {
        await twilioClient.calls(CallSid as string).update({
          status: "completed",
        });
        console.log(`🛑 Hang up: Machine detected`);
      } catch (hangupError) {
        console.error("Hangup error:", hangupError);
      }
    } else {
      console.log(`💬 Continue call: ${detectionResult}`);
    }

    return NextResponse.json({
      success: true,
      detectionResult,
      confidence,
      latency: detectionDuration,
    });
  } catch (error) {
    console.error("AMD error:", error);
    return NextResponse.json({ error: "AMD failed" }, { status: 500 });
  }
}
