import { NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;

    console.log(`🔊 Gemini voice webhook for call: ${callSid}`);

    const response = new VoiceResponse();

    // Greeting that encourages natural speech for better transcript analysis
    response.say(
      {
        voice: "alice",
        language: "en-US",
      },
      "Thank you for answering. Please speak naturally - this call is being analyzed for verification purposes."
    );

    // 8-second pause to capture speech
    response.pause({ length: 8 });

    response.say("Thank you. Analysis complete.");
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
