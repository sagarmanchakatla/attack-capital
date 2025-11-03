const { WebSocketServer } = require("ws");
const { createServer } = require("http");

const server = createServer();
const wss = new WebSocketServer({ server });

const audioBuffers = new Map();

wss.on("connection", (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const callSid = url.searchParams.get("callSid");

  console.log(`🔊 WebSocket connected for call: ${callSid}`);

  if (!callSid) {
    ws.close(1008, "Missing callSid");
    return;
  }

  // Initialize audio buffer for this call
  audioBuffers.set(callSid, []);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.event === "media" && message.media) {
        await handleAudioChunk(callSid, message.media.payload);
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    console.log(`🔊 WebSocket disconnected for call: ${callSid}`);
    audioBuffers.delete(callSid);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for call ${callSid}:`, error);
  });
});

async function handleAudioChunk(callSid, payload) {
  try {
    const audioBuffer = Buffer.from(payload, "base64");
    const buffers = audioBuffers.get(callSid) || [];
    buffers.push(audioBuffer);

    console.log(
      `🎯 Received audio chunk for ${callSid}, buffer size: ${buffers.length}`
    );

    // Process when we have enough audio
    if (buffers.length >= 4) {
      const combinedBuffer = Buffer.concat(buffers);
      console.log(
        `🎯 Processing ${combinedBuffer.length} bytes for ${callSid}`
      );

      // Here you would send to HuggingFace service
      // const result = await huggingfaceClient.predictAudioStream(combinedBuffer);

      // For now, just log
      console.log(`🎯 Would classify audio for ${callSid}`);

      // Clear buffer
      audioBuffers.set(callSid, []);
    }
  } catch (error) {
    console.error(`Audio processing error for ${callSid}:`, error);
  }
}

server.listen(8081, () => {
  console.log("🔊 WebSocket server running on port 8081");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("🛑 Shutting down WebSocket server...");
  wss.close();
  server.close();
  process.exit(0);
});
