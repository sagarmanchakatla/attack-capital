import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  const response = new VoiceResponse();

  // Simple, clear message
  response.say(
    { voice: "alice", language: "en-US" },
    "Hello. Thank you for answering this test call."
  );

  response.pause({ length: 5 });

  response.say(
    { voice: "alice", language: "en-US" },
    "This call is now complete. Goodbye."
  );

  response.hangup();

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
