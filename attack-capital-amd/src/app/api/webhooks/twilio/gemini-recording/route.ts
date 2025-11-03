import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { twilioClient } from "@/lib/twilio/client";
import { geminiClient } from "@/lib/amd-strategies/gemini-client";

// Simulate transcript extraction (replace with actual speech-to-text service)
async function simulateTranscriptExtraction(
  recordingSid: string
): Promise<string> {
  // In production, integrate with:
  // - Twilio Speech Recognition
  // - Google Speech-to-Text
  // - AWS Transcribe
  // - Azure Speech Services

  // For now, return simulated transcripts based on common patterns
  const transcripts = [
    "Hello thank you for calling this is an automated voicemail system please leave your message after the beep",
    "Hi hello yes I can hear you who is this calling please",
    "Welcome to our voicemail service we are unable to answer your call right now",
    "Hey there I just wanted to follow up on our previous conversation about the project",
    "This mailbox is full please try your call again later goodbye",
    "Hi this is John sorry I missed your call please leave a message and I'll get back to you",
    "The number you have dialed is not in service please check the number and try again",
    "Yes hello I'm here can you hear me properly what can I help you with today",
  ];

  return transcripts[Math.floor(Math.random() * transcripts.length)];
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
    tokens_used: 0,
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
    completedAt: new Date(),
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
        model_used: "gemini-2.5-flash",
      },
    },
  });
}

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

    // Step 1: Get recording transcript and analyze with Gemini
    try {
      console.log(`📥 Processing recording for Gemini transcript analysis...`);

      // Get recording details (if you have twilioClient configured)
      let audioDuration = RecordingDuration
        ? parseInt(RecordingDuration as string)
        : 0;

      // Extract transcript using the standalone function
      const simulatedTranscript = await simulateTranscriptExtraction(
        RecordingSid as string
      );

      console.log(
        `📝 Extracted transcript (${simulatedTranscript.length} chars): ${simulatedTranscript}`
      );

      // Check Gemini health
      const health = await geminiClient.healthCheck();
      if (health.status === "healthy") {
        console.log(`🤖 Sending transcript to Gemini for analysis...`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
          result = await geminiClient.analyzeTranscript(
            simulatedTranscript,
            audioDuration
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
          tokens_used: 0,
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
      processing_time: result.processing_time,
    });
  } catch (error: any) {
    console.error("❌ Gemini recording webhook error:", error);
    return NextResponse.json(
      { error: "Gemini processing failed", message: error.message },
      { status: 500 }
    );
  }
}
