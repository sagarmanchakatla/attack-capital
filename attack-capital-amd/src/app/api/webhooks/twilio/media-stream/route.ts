import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;

    console.log("🔊 Media Stream Webhook for call:", callSid);

    if (!callSid) {
      return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
    }

    // Get the host for WebSocket URL
    const host = request.headers.get("host");
    const protocol = host?.includes("localhost") ? "ws" : "wss";

    // Return TwiML that connects to our WebSocket
    const { VoiceResponse } = await import("twilio").then(
      (twilio) => twilio.twiml
    );

    const response = new VoiceResponse();

    const start = response.start();
    start.stream({
      url: `${protocol}://${host}/api/websocket?callSid=${callSid}`,
    });

    // Say something while processing
    response.say(
      {
        voice: "alice",
        language: "en-US",
      },
      "Please wait while we analyze your voice."
    );

    response.pause({ length: 10 });

    // Fallback if no decision is made
    response.say("Analysis complete. Thank you.");
    response.hangup();

    console.log("🎯 Generated Media Stream TwiML with WebSocket URL");

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Media stream webhook error:", error);

    const { VoiceResponse } = await import("twilio").then(
      (twilio) => twilio.twiml
    );
    const response = new VoiceResponse();
    response.say("Error setting up voice analysis.");
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
