import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";
import { jambonzApiInitiateCall } from "@/lib/jambonz"; // You will create this client

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phoneNumber } = await req.json();
  if (!phoneNumber)
    return NextResponse.json(
      { error: "Missing phone number" },
      { status: 400 }
    );

  const normalizedNumber = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+1${phoneNumber.replace(/\D/g, "")}`;

  // Create call record (Jambonz-only, no Twilio SID)
  const call = await prisma.call.create({
    data: {
      userId: session.user.id,
      phoneNumber: normalizedNumber,
      amdStrategy: "jambonz",
      status: "initiated",
    },
  });

  // Make Outbound SIP Call via Jambonz API
  const jambonzResult = await jambonzApiInitiateCall({
    from: process.env.JAMBONZ_SIP_USERNAME!, // your registered SIP
    to: normalizedNumber,
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/jambonz`,
    callId: call.id,
  });

  await prisma.call.update({
    where: { id: call.id },
    data: { jambonzCallSid: jambonzResult.sid, status: "ringing" },
  });

  await prisma.callEvent.create({
    data: {
      callId: call.id,
      eventType: "initiated",
      data: {
        phoneNumber: normalizedNumber,
        jambonzCallSid: jambonzResult.sid,
      },
    },
  });

  return NextResponse.json({
    callId: call.id,
    jambonzCallSid: jambonzResult.sid,
    success: true,
  });
}
