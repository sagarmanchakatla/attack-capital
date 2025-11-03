import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const dialStatus = formData.get("DialStatus");
    const callSid = formData.get("CallSid");

    console.log("🔔 Dial Status:", {
      callSid,
      dialStatus,
    });

    const response = new VoiceResponse();

    if (dialStatus === "answered") {
      response.say("Call was answered successfully.");
    } else {
      response.say(`Call ended with status: ${dialStatus}`);
    }

    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Dial status error:", error);

    const response = new VoiceResponse();
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
