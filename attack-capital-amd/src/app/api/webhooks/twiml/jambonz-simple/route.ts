import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  const response = new VoiceResponse();

  console.log("🔔 Simple Jambonz TwiML endpoint hit");

  // Get the form data
  const formData = await request.formData();
  const to = formData.get("To") as string;

  console.log("📞 To:", to);

  if (to && to.includes("sip:")) {
    const dial = response.dial({
      timeout: 30,
      action: "/api/webhooks/jambonz/dial-status",
      method: "POST",
    });

    // Dial the SIP URI directly
    dial.sip(to);
    console.log(`🎯 Dialing SIP: ${to}`);
  } else {
    response.say("Invalid destination");
    response.hangup();
  }

  const twiml = response.toString();
  console.log("📋 Simple TwiML:", twiml);

  return new NextResponse(twiml, {
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
