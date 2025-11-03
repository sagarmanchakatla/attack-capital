import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/better-auth";
import { geminiClient } from "@/lib/amd-strategies/gemini-client";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const BodySchema = z.object({
  phoneNumber: z.string().min(10, "Phone number too short"),
  amdStrategy: z.literal("gemini"),
});

export async function POST(req: Request) {
  try {
    console.log("📞 Gemini AMD dial endpoint called");

    // Parse + validate body
    const json = await req.json();
    const parse = BodySchema.safeParse(json);

    if (!parse.success) {
      return NextResponse.json(
        { error: "invalid_payload", details: parse.error.flatten() },
        { status: 400 }
      );
    }

    const { phoneNumber } = parse.data;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Test Gemini service
    const health = await geminiClient.healthCheck();
    if (health.status !== "healthy") {
      return NextResponse.json(
        {
          error: "gemini_service_unavailable",
          message: "Gemini AMD service is not available",
          details: health.api_key_configured
            ? "Gemini API key configured but model unavailable"
            : "GEMINI_API_KEY environment variable not set",
        },
        { status: 400 }
      );
    }

    // Validate environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    const defaultFrom = process.env.TWILIO_PHONE_NUMBER;

    if (!baseUrl || !defaultFrom) {
      return NextResponse.json(
        {
          error: "server_configuration_error",
          message: "Server is missing required configuration",
        },
        { status: 500 }
      );
    }

    try {
      // Create Twilio call with recording for Gemini analysis
      const twilioCall = await client.calls.create({
        to: phoneNumber,
        from: defaultFrom,
        // Enable recording for Gemini analysis
        record: true,
        recordingStatusCallback: `${baseUrl}/api/webhooks/twilio/gemini-recording`,
        recordingStatusCallbackEvent: ["completed"],
        // Standard call tracking
        statusCallback: `${baseUrl}/api/webhooks/twilio/status`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
        // Voice instructions
        url: `${baseUrl}/api/webhooks/twilio/gemini-voice`,
        // Twilio AMD as fallback
        machineDetection: "Enable",
        machineDetectionTimeout: 10,
      });

      const twilioSid = twilioCall.sid;

      // Create DB entry
      const call = await prisma.call.create({
        data: {
          userId: session.user.id,
          phoneNumber,
          amdStrategy: "gemini",
          status: "initiated",
          twilioSid: twilioSid,
          startedAt: new Date(),
        },
      });

      console.log(`📝 Created Gemini call record: ${call.id}`);

      // Log initial event
      await prisma.callEvent.create({
        data: {
          callId: call.id,
          eventType: "initiated",
          data: {
            twilioCall: twilioCall,
            strategy: "gemini",
            gemini_health: health,
            cost_estimate: geminiClient.getModelInfo(),
          },
        },
      });

      console.log(`✅ Gemini AMD call initiated successfully: ${twilioSid}`);

      return NextResponse.json({
        success: true,
        callId: call.id,
        callSid: twilioSid,
        status: "ringing",
        message: "Call initiated with Gemini Flash Live AMD",
        amdConfig: {
          strategy: "gemini",
          model: geminiClient.getModelInfo().model_name,
          features: [
            "Multimodal AI analysis",
            "LLM-based reasoning",
            "Real-time capable",
            "Cost-optimized",
            "Fallback to Twilio AMD",
          ],
          status: geminiClient.getModelInfo().status,
          cost_estimate: "~$0.15-0.25 per minute",
        },
      });
    } catch (callError: any) {
      console.error("❌ Gemini call creation failed:", callError);

      // Create failed call record
      const failedCall = await prisma.call.create({
        data: {
          userId: session.user.id,
          phoneNumber,
          amdStrategy: "gemini",
          status: "failed",
          startedAt: new Date(),
          completedAt: new Date(),
          detectionResult: "failed",
        },
      });

      await prisma.callEvent.create({
        data: {
          callId: failedCall.id,
          eventType: "failed",
          data: {
            error: callError.message,
          },
        },
      });

      return NextResponse.json(
        {
          error: "call_creation_failed",
          message: callError.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("❌ Gemini dial endpoint error:", error);
    return NextResponse.json(
      { error: "internal_server_error", message: error.message },
      { status: 500 }
    );
  }
}
