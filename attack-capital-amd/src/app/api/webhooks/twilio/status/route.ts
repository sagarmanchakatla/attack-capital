import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    // Get form data from Twilio
    const formData = await request.formData();
    const params = Object.fromEntries(formData);

    const { CallSid, CallStatus, CallDuration, To, From, Timestamp } = params;

    console.log(`Status webhook for ${CallSid}: ${CallStatus}`);

    // Find call in database
    const call = await prisma.call.findFirst({
      where: { twilioSid: CallSid as string },
    });

    if (!call) {
      console.error("Call not found:", CallSid);
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Update call status
    const updateData: any = {
      status: CallStatus as string,
    };

    if (CallStatus === "completed" || CallStatus === "failed") {
      updateData.completedAt = new Date();
      updateData.duration = CallDuration
        ? parseInt(CallDuration as string)
        : null;
    }

    if (CallStatus === "in-progress" || CallStatus === "answered") {
      updateData.answeredAt = new Date();
    }

    await prisma.call.update({
      where: { id: call.id },
      data: updateData,
    });

    // Log event
    await prisma.callEvent.create({
      data: {
        callId: call.id,
        eventType: CallStatus as string,
        data: params,
      },
    });

    console.log(`Updated call ${call.id} status to ${CallStatus}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
