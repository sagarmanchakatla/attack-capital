import { WebSocketServer } from "ws";
import { createServer, IncomingMessage } from "http";

// Remove the export from class declaration and use module.exports
class AudioWebSocketServer {
  private wss: WebSocketServer;
  private audioBuffers: Map<string, Buffer[]> = new Map();
  private server: ReturnType<typeof createServer>;

  constructor(port: number = 8081) {
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();

    this.server.listen(port, () => {
      console.log(`🔊 WebSocket server running on port ${port}`);
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws, request: IncomingMessage) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const callSid = url.searchParams.get("callSid");

      console.log(`🔊 WebSocket connected for call: ${callSid}`);

      if (!callSid) {
        ws.close(1008, "Missing callSid");
        return;
      }

      // Initialize audio buffer for this call
      this.audioBuffers.set(callSid, []);

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.event === "media" && message.media) {
            await this.handleAudioChunk(callSid, message.media.payload);
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });

      ws.on("close", () => {
        console.log(`🔊 WebSocket disconnected for call: ${callSid}`);
        this.audioBuffers.delete(callSid);
      });

      ws.on("error", (error) => {
        console.error(`WebSocket error for call ${callSid}:`, error);
      });
    });
  }

  private async handleAudioChunk(callSid: string, payload: string) {
    try {
      console.log(`🎯 Processing audio chunk for ${callSid}`);

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(payload, "base64");

      // Add to buffer
      const buffers = this.audioBuffers.get(callSid) || [];
      buffers.push(audioBuffer);

      // Process when we have enough audio
      if (buffers.length >= 4) {
        const combinedBuffer = Buffer.concat(buffers);
        console.log(`🎯 Sending ${combinedBuffer.length} bytes to HuggingFace`);

        // For now, just log - we'll add HuggingFace integration later
        console.log(`🎯 Would send to HuggingFace for AMD analysis`);

        // Clear buffer after processing
        this.audioBuffers.set(callSid, []);
      }
    } catch (error) {
      console.error(`Audio processing error for ${callSid}:`, error);
    }
  }

  public close() {
    this.wss.close();
    this.server.close();
  }
}

// Export the class
module.exports = { AudioWebSocketServer };
