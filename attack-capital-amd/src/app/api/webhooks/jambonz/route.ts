import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { call_sid, event, reason, hint, transcript } = payload;

  // Find the call for this jambonz SID
  const call = await prisma.call.findFirst({
    where: { jambonzCallSid: call_sid },
  });
  if (!call)
    return NextResponse.json({ error: "Call not found" }, { status: 404 });

  let detectionResult: "human" | "machine" | "undecided" | "failed" =
    "undecided";
  let confidence = 0.5;
  let shouldHangup = false;

  switch (event) {
    case "amd_human_detected":
      detectionResult = "human";
      confidence = 0.9;
      break;
    case "amd_machine_detected":
    case "amd_tone_detected":
      detectionResult = "machine";
      confidence = 0.95;
      shouldHangup = true;
      break;
    case "amd_error":
      detectionResult = "failed";
      confidence = 0.1;
      break;
    default:
      detectionResult = "undecided";
      confidence = 0.5;
  }

  await prisma.call.update({
    where: { id: call.id },
    data: {
      detectionResult,
      confidence,
      amdStatus: event,
      status: "completed",
      updatedAt: new Date(),
    },
  });

  await prisma.callEvent.create({
    data: {
      callId: call.id,
      eventType: `amd_${event}`,
      data: {
        event,
        detectionResult,
        confidence,
        reason,
        hint,
        transcript,
        jambonzCallSid: call_sid,
      },
    },
  });

  // Respond with actions to Jambonz: Hangup for machine, continue for human
  if (shouldHangup) {
    return NextResponse.json([{ verb: "hangup" }]);
  } else {
    return NextResponse.json([
      { verb: "say", text: "Thank you for answering!", voice: "alice" },
    ]);
  }
}
