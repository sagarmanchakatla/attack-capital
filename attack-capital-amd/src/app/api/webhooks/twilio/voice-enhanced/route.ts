import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  const response = new VoiceResponse();

  // Simple message for DetectMessageEnd mode
  response.say(
    { voice: "alice", language: "en-US" },
    "Hello. This is an automated test call. Thank you."
  );

  response.hangup();

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
