import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/db/prisma";
import {
  twilioClient,
  TWILIO_PHONE_NUMBER,
  TWILIO_AMD_CONFIG,
} from "@/lib/twilio/client";
import { z } from "zod";

const dialSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
});

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate request body
    const body = await request.json();
    const { phoneNumber } = dialSchema.parse(body);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    console.log(`📞 Calling: ${phoneNumber}`);

    // Simple call configuration
    const callOptions: any = {
      to: phoneNumber,
      from: TWILIO_PHONE_NUMBER,
      statusCallback: `${baseUrl}/api/webhooks/twilio/status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      url: `${baseUrl}/api/webhooks/twilio/voice`,
      ...TWILIO_AMD_CONFIG,
    };

    // Add AMD callback separately to avoid conflicts
    callOptions.asyncAmdStatusCallback = `${baseUrl}/api/webhooks/twilio/amd`;

    console.log("Simple AMD Config:", {
      machineDetection: callOptions.machineDetection,
      timeout: callOptions.machineDetectionTimeout,
    });

    // Initiate call
    const call = await twilioClient.calls.create(callOptions);

    console.log(`✅ Call created: ${call.sid}`);

    // Save call to database
    const dbCall = await prisma.call.create({
      data: {
        userId: session.user.id,
        phoneNumber,
        amdStrategy: "twilio-native",
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
        data: { twilioSid: call.sid },
      },
    });

    return NextResponse.json({
      success: true,
      callId: dbCall.id,
      callSid: call.sid,
      status: "initiated",
    });
  } catch (error: any) {
    console.error("Dial error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    if (error.code === 21219) {
      return NextResponse.json(
        { error: "Number not verified in Twilio" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to call", message: error.message },
      { status: 500 }
    );
  }
}
