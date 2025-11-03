import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  const response = new VoiceResponse();

  console.log("🔔 Jambonz Voice Webhook: Generating TwiML for SIP call");

  // For SIP trunk calls to Jambonz, we need to connect the call
  // The <Dial> verb will connect to Jambonz SIP endpoint
  const dial = response.dial({
    action: "/api/webhooks/jambonz/dial-status", // Optional: status callback after dial
    method: "POST",
    timeout: 30,
  });

  // Dial to the same SIP URI that we're calling
  // Jambonz will handle the AMD processing
  dial.sip(
    `sip:${
      request.url.includes("to=")
        ? new URL(request.url).searchParams.get("to")
        : ""
    }@sagar.sip.jambonz.cloud`
  );

  // Fallback: if SIP dial fails, play a message
  response.say(
    { voice: "alice", language: "en-US" },
    "We are connecting your call to the AMD detection system."
  );

  console.log("🎯 Generated TwiML:", response.toString());

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
