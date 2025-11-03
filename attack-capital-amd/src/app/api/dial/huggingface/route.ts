import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";
import { twilioClient, TWILIO_PHONE_NUMBER } from "@/lib/twilio/client";
import { z } from "zod";

const dialSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
});

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate request body
    const body = await request.json();
    const { phoneNumber } = dialSchema.parse(body);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    console.log(`🤖 HuggingFace AMD - Calling: ${phoneNumber}`);

    // Create call with recording enabled for HuggingFace analysis
    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: TWILIO_PHONE_NUMBER,
      // Use recording webhook for HuggingFace analysis
      record: true,
      recordingStatusCallback: `${baseUrl}/api/webhooks/twilio/recording`,
      recordingStatusCallbackEvent: ["completed"],
      // Standard status callbacks
      statusCallback: `${baseUrl}/api/webhooks/twilio/status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      // Voice instructions
      url: `${baseUrl}/api/webhooks/twilio/huggingface-voice`,
      // Twilio AMD as backup
      machineDetection: "Enable",
      machineDetectionTimeout: 10,
      asyncAmd: true,
      asyncAmdStatusCallback: `${baseUrl}/api/webhooks/twilio/amd`,
      asyncAmdStatusCallbackMethod: "POST",
    });

    console.log(`✅ HuggingFace call created: ${call.sid}`);

    // Save call to database
    const dbCall = await prisma.call.create({
      data: {
        userId: session.user.id,
        phoneNumber,
        amdStrategy: "huggingface",
        twilioSid: call.sid,
        status: "initiated",
        startedAt: new Date(),
      },
    });

    // Log initial event
    await prisma.callEvent.create({
      data: {
        callId: dbCall.id,
        eventType: "initiated",
        data: {
          twilioSid: call.sid,
          strategy: "huggingface",
          withRecording: true,
        },
      },
    });

    return NextResponse.json({
      success: true,
      callId: dbCall.id,
      callSid: call.sid,
      status: "initiated",
      message: "Call initiated with HuggingFace AMD + recording",
    });
  } catch (error: any) {
    console.error("❌ HuggingFace dial error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to call", message: error.message },
      { status: 500 }
    );
  }
}
