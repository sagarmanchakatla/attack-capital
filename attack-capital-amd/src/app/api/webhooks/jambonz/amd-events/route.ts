import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { WebhookResponse } from "@/lib/jambonz/client";
import { hangupCall } from "@/lib/jambonz/client";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log(
      "🔔 Jambonz AMD Events Webhook:",
      JSON.stringify(payload, null, 2)
    );

    const { call_sid, type, reason, hint, transcript, language, greeting } =
      payload;

    if (!call_sid) {
      console.error("Missing call_sid in AMD webhook");
      return NextResponse.json({ error: "Missing call_sid" }, { status: 400 });
    }

    // Find call by Jambonz call SID
    const call = await prisma.call.findFirst({
      where: {
        OR: [{ jambonzCallSid: call_sid }, { twilioSid: call_sid }],
      },
    });

    if (!call) {
      console.error("Call not found for Jambonz SID:", call_sid);
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const app = new WebhookResponse();
    let detectionResult: "human" | "machine" | "undecided" | "failed" =
      "undecided";
    let confidence = 0.5;

    // Handle AMD events based on Jambonz documentation
    switch (type) {
      case "amd_human_detected":
        detectionResult = "human";
        confidence = 0.95;
        console.log(`✅ AMD: Human detected - ${reason || "short greeting"}`);

        // Connect to human with greeting
        app
          .say({
            text: "Hello! We've detected a human answer. Thank you for picking up. This is a test call for our advanced answering machine detection system. Goodbye!",
            voice: "alice",
          })
          .pause({ length: 1 })
          .hangup();
        break;

      case "amd_machine_detected":
        detectionResult = "machine";
        confidence = 0.92;
        console.log(
          `🤖 AMD: Machine detected - Reason: ${reason}, Hint: ${hint}`
        );

        // Hang up immediately on machine
        app.hangup();
        break;

      case "amd_no_speech_detected":
        detectionResult = "undecided";
        confidence = 0.3;
        console.log(`❓ AMD: No speech detected`);

        // Treat as human but log uncertainty
        app
          .say({
            text: "We were unable to detect speech. Please hold while we connect your call.",
            voice: "alice",
          })
          .pause({ length: 2 })
          .hangup();
        break;

      case "amd_decision_timeout":
        detectionResult = "undecided";
        confidence = 0.4;
        console.log(`⏰ AMD: Decision timeout`);

        // Fallback to human
        app
          .say({
            text: "We're having trouble determining the call type. Please hold.",
            voice: "alice",
          })
          .pause({ length: 2 })
          .hangup();
        break;

      case "amd_tone_detected":
        detectionResult = "machine";
        confidence = 0.98;
        console.log(`🔊 AMD: Beep tone detected`);

        // Definitely a machine - hang up
        app.hangup();
        break;

      case "amd_machine_stopped_speaking":
        detectionResult = "machine";
        confidence = 0.96;
        console.log(`🛑 AMD: Machine stopped speaking`);

        // Machine greeting completed - hang up
        app.hangup();
        break;

      case "amd_error":
        detectionResult = "failed";
        confidence = 0.1;
        console.error(`❌ AMD: Error - ${payload.error}`);

        // Error handling - treat as human
        app
          .say({
            text: "We experienced a technical issue. Please hold.",
            voice: "alice",
          })
          .hangup();
        break;

      default:
        console.log(`ℹ️ Unhandled AMD event: ${type}`);
        return NextResponse.json(app);
    }

    // Update call with AMD results
    await prisma.call.update({
      where: { id: call.id },
      data: {
        detectionResult,
        confidence,
        amdStatus: type,
        latency: Date.now() - call.startedAt.getTime(),
        updatedAt: new Date(),
      },
    });

    // Log AMD event with detailed information
    await prisma.callEvent.create({
      data: {
        callId: call.id,
        eventType: `amd_${type}`,
        data: {
          type,
          detectionResult,
          confidence,
          reason,
          hint,
          transcript,
          language,
          greeting,
          callSid: call_sid,
          strategy: "jambonz-sip-enhanced",
        },
      },
    });

    console.log(
      `📊 AMD Result: ${detectionResult} (${confidence}) - Event: ${type}`
    );

    return NextResponse.json(app);
  } catch (error) {
    console.error("Jambonz AMD webhook error:", error);

    // Return empty webhook response to avoid breaking call flow
    const app = new WebhookResponse();
    return NextResponse.json(app);
  }
}
