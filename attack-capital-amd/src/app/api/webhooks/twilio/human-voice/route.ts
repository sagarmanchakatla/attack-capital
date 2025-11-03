import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Human Voice Endpoint - Post-detection handling
 * 
 * This endpoint is called after AMD confirms a human answered.
 * Used for both baseline and detect-message-end strategies.
 */
export async function POST(request: NextRequest) {
  const response = new VoiceResponse();

  // Post-detection message for confirmed human calls
  response.say(
    { voice: "alice", language: "en-US" },
    "Thank you for answering. We have confirmed you are a human. This call is being connected."
  );

  // Give time for response
  response.pause({ length: 2 });

  response.say(
    { voice: "alice", language: "en-US" },
    "Thank you for your time. Have a great day!"
  );

  response.hangup();

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}

