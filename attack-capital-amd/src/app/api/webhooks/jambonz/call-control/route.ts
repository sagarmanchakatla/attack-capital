import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { WebhookResponse } from "@/lib/jambonz/client";
import { hangupCall } from "@/lib/jambonz/client";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log(
      "🔔 Jambonz Call Control Webhook:",
      JSON.stringify(payload, null, 2)
    );

    const { call_sid, event, speech, amd, call_status } = payload;

    if (!call_sid) {
      console.error("Missing call_sid in call control webhook");
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

    // Log the event
    await prisma.callEvent.create({
      data: {
        callId: call.id,
        eventType: `jambonz_${event}`,
        data: payload,
      },
    });

    const app = new WebhookResponse();
    let detectionResult: "human" | "machine" | "undecided" | "failed" =
      "undecided";
    let confidence = 0.5;

    // Handle Jambonz events
    switch (event) {
      case "answer":
        console.log(`📞 Call answered: ${call_sid}`);

        await prisma.call.update({
          where: { id: call.id },
          data: {
            status: "in-progress",
            answeredAt: new Date(),
          },
        });

        // AMD is handled automatically by Jambonz
        return NextResponse.json(app);

      case "amd":
        // AMD result from Jambonz
        if (amd) {
          detectionResult = amd.outcome || amd.result || "undecided";
          confidence = amd.confidence || 0.5;

          console.log(
            `🎯 Jambonz AMD Result: ${detectionResult} (${confidence})`
          );

          // Update call with AMD results
          await prisma.call.update({
            where: { id: call.id },
            data: {
              detectionResult,
              confidence,
              amdStatus: event,
              latency: Date.now() - call.startedAt.getTime(),
              updatedAt: new Date(),
            },
          });

          // Log AMD event
          await prisma.callEvent.create({
            data: {
              callId: call.id,
              eventType: "amd_completed",
              data: {
                event,
                detectionResult,
                confidence,
                amdData: amd,
                speech: speech || {},
              },
            },
          });

          // Handle based on detection result
          if (detectionResult === "machine") {
            // Hang up on machine
            app
              .say({
                text: "We've detected a voicemail system. Goodbye.",
                voice: "alice",
              })
              .hangup();

            console.log(`🤖 Machine detected - hanging up: ${call_sid}`);
          } else if (detectionResult === "human") {
            // Connect to human
            app
              .say({
                text: "Hello! We've detected a human answer. Thank you for picking up. This is a test call for our answering machine detection system. Goodbye!",
                voice: "alice",
              })
              .pause({ length: 1 })
              .hangup();

            console.log(`✅ Human detected - connecting: ${call_sid}`);
          } else {
            // Undecided - treat as human
            app
              .say({
                text: "Hello! We're connecting your call. Thank you for your time.",
                voice: "alice",
              })
              .pause({ length: 2 })
              .hangup();

            console.log(`❓ AMD undecided - treating as human: ${call_sid}`);
          }
        }
        break;

      case "speech":
        // Real-time speech analysis
        if (speech) {
          console.log(
            `🗣️ Speech detected: ${speech.text} (confidence: ${speech.confidence})`
          );

          await prisma.callEvent.create({
            data: {
              callId: call.id,
              eventType: "speech_detected",
              data: {
                text: speech.text,
                confidence: speech.confidence,
                duration: speech.duration,
              },
            },
          });
        }
        break;

      default:
        console.log(`ℹ️ Unhandled Jambonz event: ${event}`);
        return NextResponse.json(app);
    }

    return NextResponse.json(app);
  } catch (error) {
    console.error("Jambonz call control webhook error:", error);

    // Return empty webhook response
    const app = new WebhookResponse();
    return NextResponse.json(app);
  }
}
