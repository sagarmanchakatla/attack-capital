import { NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST() {
  const response = new VoiceResponse();

  response.say("We detected this is a voicemail. Goodbye.");
  response.hangup();

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
