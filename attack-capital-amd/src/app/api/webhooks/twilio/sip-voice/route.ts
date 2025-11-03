import { NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: Request) {
  const response = new VoiceResponse();

  console.log("🔔 Twilio SIP Voice Webhook called");

  try {
    const formData = await request.formData();
    const to = formData.get("To") as string;
    const from = formData.get("From") as string;

    console.log(`📞 SIP Call - From: ${from}, To: ${to}`);

    // Route call through Jambonz SIP trunk
    const dial = response.dial({
      action: "/api/webhooks/twilio/sip-dial-status",
      method: "POST",
      timeout: 30,
    });

    // Dial to Jambonz SIP domain
    dial.sip(`sip:${to}@${process.env.JAMBONZ_SIP_DOMAIN}`);

    console.log("🎯 Routing SIP call to Jambonz");

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("SIP voice webhook error:", error);

    const response = new VoiceResponse();
    response.say("Error processing SIP call");
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
