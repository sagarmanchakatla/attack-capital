import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { twilioClient } from "@/lib/twilio/client";
import { geminiClient } from "@/lib/amd-strategies/gemini-client";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const data = Object.fromEntries(formData);

    const {
      CallSid,
      RecordingUrl,
      RecordingSid,
      RecordingDuration,
      RecordingStatus,
    } = data;

    console.log(`🔊 Gemini recording webhook for call: ${CallSid}`);
    console.log(
      `📁 Recording: ${RecordingSid}, Duration: ${RecordingDuration}s`
    );

    if (!CallSid || !RecordingUrl) {
      return NextResponse.json(
        { error: "Missing CallSid or RecordingUrl" },
        { status: 400 }
      );
    }

    // Find call
    const call = await prisma.call.findFirst({
      where: { twilioSid: CallSid as string },
    });

    if (!call) {
      console.error("Call not found for twilioSid:", CallSid);
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    let result: any;
    let strategy = "gemini";
    let geminiServiceAvailable = false;

    // Step 1: Try Gemini analysis
    try {
      console.log(`📥 Downloading recording for Gemini analysis...`);

      // Download recording using Twilio client
      const recording = await twilioClient
        .recordings(RecordingSid as string)
        .fetch();
      const recordingUri = `https://api.twilio.com${recording.uri.replace(
        ".json",
        ".wav"
      )}`;

      console.log(`🔗 Recording URI: ${recordingUri}`);

      const audioResponse = await fetch(recordingUri, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
            ).toString("base64"),
        },
      });

      if (audioResponse.ok) {
        const audioBuffer = await audioResponse.arrayBuffer();
        console.log(
          `✅ Downloaded ${audioBuffer.byteLength} bytes for Gemini analysis`
        );

        // Check Gemini health
        const health = await geminiClient.healthCheck();
        if (health.status === "healthy") {
          console.log(`🤖 Sending to Gemini for multimodal analysis...`);

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

          try {
            result = await geminiClient.analyzeAudio(
              Buffer.from(audioBuffer),
              RecordingDuration ? parseInt(RecordingDuration as string) : 0
            );

            clearTimeout(timeout);
            geminiServiceAvailable = true;
            strategy = "gemini";
            console.log(
              `✅ Gemini analysis: ${result.label} (${result.confidence})`
            );
          } catch (geminiError: any) {
            console.log("❌ Gemini analysis failed:", geminiError.message);
            // Continue to fallback
          }
        } else {
          console.log("❌ Gemini service unavailable:", health);
        }
      } else {
        console.log("❌ Failed to download recording:", audioResponse.status);
      }
    } catch (error: any) {
      console.log("❌ Gemini processing failed:", error.message);
    }

    // Step 2: Check for Twilio AMD fallback
    if (!result) {
      console.log("🔄 Gemini failed, checking for Twilio AMD fallback...");

      const amdEvent = await prisma.callEvent.findFirst({
        where: {
          callId: call.id,
          eventType: "amd_completed",
        },
        orderBy: { createdAt: "desc" },
      });

      if (amdEvent && amdEvent.data) {
        const amdData = amdEvent.data as any;
        strategy = "twilio-native";
        result = {
          label: amdData.detectionResult || "undecided",
          confidence: amdData.confidence || 0.5,
          reasoning: `Twilio AMD fallback: ${amdData.answeredBy || "unknown"}`,
          processing_time: 0,
          audio_duration: RecordingDuration
            ? parseInt(RecordingDuration as string)
            : 0,
          detectionPattern: "twilio_amd_fallback",
          audioQuality: "unknown",
          callEnvironment: "unknown",
          cost_estimate: 0,
        };
        console.log(`🔄 Using Twilio AMD fallback: ${result.label}`);
      }
    }

    // Step 3: Ultimate fallback
    if (!result) {
      console.log(
        "⚠️ Both Gemini and Twilio AMD failed, using duration-based fallback"
      );
      strategy = "fallback";
      const duration = RecordingDuration
        ? parseInt(RecordingDuration as string)
        : 0;
      result = createDurationBasedResult(duration);
    }

    // Update database
    await updateCallWithResult(call.id, result, strategy, {
      recordingUrl: RecordingUrl as string,
      recordingDuration: RecordingDuration
        ? parseInt(RecordingDuration as string)
        : null,
      geminiServiceAvailable,
    });

    console.log(
      `✅ Gemini processing complete for ${CallSid}: ${result.label} via ${strategy}`
    );

    return NextResponse.json({
      success: true,
      label: result.label,
      confidence: result.confidence,
      strategy: strategy,
      geminiServiceAvailable,
      cost_estimate: result.cost_estimate || 0,
      reasoning: result.reasoning,
    });
  } catch (error: any) {
    console.error("❌ Gemini recording webhook error:", error);
    return NextResponse.json(
      { error: "Gemini processing failed", message: error.message },
      { status: 500 }
    );
  }
}

function createDurationBasedResult(duration: number): any {
  const label = duration < 4 ? "machine" : "human";
  const confidence = duration < 4 ? 0.7 : 0.8;

  return {
    label,
    confidence,
    reasoning: `Duration-based classification (${duration}s)`,
    processing_time: 0,
    audio_duration: duration,
    detectionPattern: "duration_fallback",
    audioQuality: "unknown",
    callEnvironment: "unknown",
    cost_estimate: 0,
  };
}

async function updateCallWithResult(
  callId: string,
  result: any,
  strategy: string,
  metadata: {
    recordingUrl: string;
    recordingDuration: number | null;
    geminiServiceAvailable: boolean;
  }
) {
  const updateData: any = {
    detectionResult: result.label,
    confidence: result.confidence,
    detectionPattern: result.detectionPattern,
    audioQuality: result.audioQuality,
    callEnvironment: result.callEnvironment,
    latency: result.processing_time ? Math.round(result.processing_time) : null,
    amdStrategy: strategy,
    updatedAt: new Date(),
  };

  await prisma.call.update({
    where: { id: callId },
    data: updateData,
  });

  await prisma.callEvent.create({
    data: {
      callId,
      eventType: "gemini_analysis_completed",
      data: {
        ...result,
        strategy,
        recordingUrl: metadata.recordingUrl,
        recordingDuration: metadata.recordingDuration,
        geminiServiceAvailable: metadata.geminiServiceAvailable,
        finalStrategy: strategy,
        model_used: "gemini-1.5-flash",
      },
    },
  });
}
