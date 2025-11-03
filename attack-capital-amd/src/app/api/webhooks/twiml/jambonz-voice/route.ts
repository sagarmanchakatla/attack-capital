import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  const response = new VoiceResponse();

  console.log("🔔 Jambonz Voice TwiML endpoint called");

  try {
    const formData = await request.formData();
    const to = formData.get("To") as string;

    console.log("📞 Incoming call to:", to);

    if (to && to.includes("sip:")) {
      // Extract phone number from SIP URI
      const phoneMatch = to.match(/sip:(\+?\d+)@/);
      if (phoneMatch) {
        const phoneNumber = phoneMatch[1];
        console.log("📱 Extracted phone number:", phoneNumber);

        const dial = response.dial({
          action: "/api/webhooks/jambonz/dial-status",
          method: "POST",
          timeout: 30,
        });

        // Use Jambonz SIP trunk with AMD
        dial.sip(
          `sip:${phoneNumber}@${process.env.JAMBONZ_SIP_DOMAIN}?x-AMD=true`
        );

        console.log(`🎯 Dialing via Jambonz SIP: ${phoneNumber}`);
      } else {
        // Fallback: dial the SIP URI directly
        const dial = response.dial();
        dial.sip(to);
      }
    } else {
      response.say("Invalid destination for SIP call");
      response.hangup();
    }

    const twiml = response.toString();
    console.log("📋 Generated TwiML:", twiml);

    return new NextResponse(twiml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Error generating TwiML:", error);

    const response = new VoiceResponse();
    response.say("Error processing call");
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}
