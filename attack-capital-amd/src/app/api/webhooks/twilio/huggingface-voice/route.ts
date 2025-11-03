import { NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;

    console.log(`🔊 HuggingFace voice webhook for call: ${callSid}`);

    const response = new VoiceResponse();

    // Simple greeting that will be recorded for HuggingFace analysis
    response.say(
      {
        voice: "alice",
        language: "en-US",
      },
      ""
    );

    // 8-second pause to capture enough audio for analysis
    response.pause({ length: 8 });

    response.say("Thank you. We are analyzing your voice now.");
    response.pause({ length: 2 });

    response.say("Analysis complete. Thank you for your time.");
    response.hangup();

    console.log(`🎯 Generated HuggingFace voice TwiML for ${callSid}`);

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("HuggingFace voice webhook error:", error);

    // Fallback response
    const response = new VoiceResponse();
    response.say("Thank you for your call. Goodbye.");
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
