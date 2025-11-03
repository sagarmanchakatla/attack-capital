import { NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;

    console.log(`🔊 Gemini voice webhook for call: ${callSid}`);

    const response = new VoiceResponse();

    // Greeting optimized for Gemini analysis
    response.say(
      {
        voice: "alice",
        language: "en-US",
      },
      "Thank you for answering. We're using advanced AI to verify this call. Please speak naturally for a few seconds."
    );

    // 10-second pause to capture good audio sample for Gemini
    response.pause({ length: 10 });

    response.say("Analysis complete. Thank you for your time.");
    response.hangup();

    console.log(`🎯 Generated Gemini voice TwiML for ${callSid}`);

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Gemini voice webhook error:", error);

    // Fallback response
    const response = new VoiceResponse();
    response.say("Thank you for your call. Goodbye.");
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
