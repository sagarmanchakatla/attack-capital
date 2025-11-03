import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { twilioClient } from "@/lib/twilio/client";

const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

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

    console.log(`🔊 Recording webhook for call: ${CallSid}`);
    console.log(
      `📁 Recording: ${RecordingSid}, Status: ${RecordingStatus}, Duration: ${RecordingDuration}s`
    );

    if (!CallSid || !RecordingUrl) {
      return NextResponse.json(
        { error: "Missing CallSid or RecordingUrl" },
        { status: 400 }
      );
    }

    // Find call using findFirst (since twilioSid may not be unique)
    const call = await prisma.call.findFirst({
      where: { twilioSid: CallSid as string },
    });

    if (!call) {
      console.error("Call not found for twilioSid:", CallSid);
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    let result: any;
    let strategy = "huggingface";
    let pythonServiceAvailable = false;

    // Step 1: Try HuggingFace classification with the recording
    try {
      console.log(`📥 Downloading recording from Twilio...`);

      // Use Twilio API to download recording with proper authentication
      const recording = await twilioClient
        .recordings(RecordingSid as string)
        .fetch();
      const recordingUri = `https://api.twilio.com${recording.uri.replace(
        ".json",
        ".wav"
      )}`;

      console.log(`🔗 Recording URI: ${recordingUri}`);

      // Download the WAV file using Twilio client
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
          `✅ Downloaded ${audioBuffer.byteLength} bytes for HuggingFace analysis`
        );

        // Send to Python service for HuggingFace analysis
        console.log(`🤖 Sending to HuggingFace service: ${PYTHON_SERVICE_URL}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000); // 20 second timeout

        try {
          // In your recording webhook, update the formData creation:
          const formData = new FormData();
          formData.append(
            "file",
            new Blob([audioBuffer], { type: "audio/wav" }),
            "recording.wav"
          );

          const pythonResponse = await fetch(`${PYTHON_SERVICE_URL}/predict`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (pythonResponse.ok) {
            pythonServiceAvailable = true;
            result = await pythonResponse.json();
            strategy = "huggingface";
            console.log(
              `✅ HuggingFace analysis completed: ${result.label} (${result.confidence})`
            );
          } else {
            throw new Error(`Python service returned ${pythonResponse.status}`);
          }
        } catch (pythonError: any) {
          console.log("❌ HuggingFace analysis failed:", pythonError.message);
          // Continue to fallback
        }
      } else {
        console.log("❌ Failed to download recording:", audioResponse.status);
      }
    } catch (error: any) {
      console.log("❌ Recording processing failed:", error.message);
    }

    // Step 2: Check if we have Twilio AMD result as fallback
    if (!result) {
      console.log("🔄 HuggingFace failed, checking for Twilio AMD result...");

      // Look for recent AMD events for this call
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
        };
        console.log(`🔄 Using Twilio AMD fallback: ${result.label}`);
      }
    }

    // Step 3: Ultimate fallback if both methods failed
    if (!result) {
      console.log(
        "⚠️ Both HuggingFace and Twilio AMD failed, using duration-based fallback"
      );
      strategy = "fallback";
      const duration = RecordingDuration
        ? parseInt(RecordingDuration as string)
        : 0;
      result = createDurationBasedResult(duration);
    }

    // Update database with results
    await updateCallWithResult(call.id, result, strategy, {
      recordingUrl: RecordingUrl as string,
      recordingDuration: RecordingDuration
        ? parseInt(RecordingDuration as string)
        : null,
      pythonServiceAvailable,
    });

    console.log(
      `✅ HuggingFace processing complete for ${CallSid}: ${result.label} via ${strategy}`
    );

    return NextResponse.json({
      success: true,
      label: result.label,
      confidence: result.confidence,
      strategy: strategy,
      pythonServiceAvailable,
      recordingDuration: RecordingDuration,
    });
  } catch (error: any) {
    console.error("❌ Recording webhook error:", error);
    return NextResponse.json(
      { error: "Recording processing failed", message: error.message },
      { status: 500 }
    );
  }
}

// Helper functions
function createDurationBasedResult(duration: number): any {
  // Simple duration-based classification
  const label = duration < 5 ? "machine" : "human";
  const confidence = duration < 5 ? 0.7 : 0.8;

  return {
    label,
    confidence,
    reasoning: `Duration-based classification (${duration}s)`,
    processing_time: 0,
    audio_duration: duration,
    detectionPattern: "duration_fallback",
    audioQuality: "unknown",
    callEnvironment: "unknown",
  };
}

async function updateCallWithResult(
  callId: string,
  result: any,
  strategy: string,
  metadata: {
    recordingUrl: string;
    recordingDuration: number | null;
    pythonServiceAvailable: boolean;
  }
) {
  const updateData: any = {
    detectionResult: result.label,
    confidence: result.confidence,
    detectionPattern: result.detectionPattern,
    audioQuality: result.audioQuality,
    callEnvironment: result.callEnvironment,
    latency: result.processing_time
      ? Math.round(result.processing_time * 1000)
      : null,
    amdStrategy: strategy,
    updatedAt: new Date(),
  };

  await prisma.call.update({
    where: { id: callId },
    data: updateData,
  });

  // Store recording URL in event data
  await prisma.callEvent.create({
    data: {
      callId,
      eventType: "recording_processed",
      data: {
        ...result,
        strategy,
        recordingUrl: metadata.recordingUrl,
        recordingDuration: metadata.recordingDuration,
        pythonServiceAvailable: metadata.pythonServiceAvailable,
        finalStrategy: strategy,
      },
    },
  });
}
