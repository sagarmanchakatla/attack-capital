import { NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST() {
  const response = new VoiceResponse();

  response.say("Connecting you to an agent.");
  // Add your agent connection logic here
  response.dial().number("+1234567890"); // Replace with actual agent number

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
