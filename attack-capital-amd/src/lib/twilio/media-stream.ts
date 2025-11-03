import WebSocket from "ws";
import { huggingfaceClient } from "@/lib/huggingface/client";

export interface MediaStreamMessage {
  event: "media" | "mark" | "start" | "stop";
  sequenceNumber?: number;
  media?: {
    track: "inbound" | "outbound";
    chunk: number;
    timestamp: number;
    payload: string; // base64 encoded audio
  };
  start?: {
    accountSid: string;
    streamSid: string;
    callSid: string;
    tracks: string[];
  };
  mark?: {
    name: string;
  };
}

export class MediaStreamHandler {
  private callSid: string;
  private audioBuffer: Buffer[] = [];
  private bufferSize = 0;
  private readonly MAX_BUFFER_SIZE = 5 * 16000; // 5 seconds at 16kHz
  private isProcessing = false;

  constructor(callSid: string) {
    this.callSid = callSid;
  }

  async handleMessage(
    message: MediaStreamMessage
  ): Promise<"human" | "machine" | "undecided" | null> {
    try {
      if (message.event === "media" && message.media?.track === "inbound") {
        return await this.processAudioChunk(message.media);
      }

      if (message.event === "stop") {
        return await this.processRemainingAudio();
      }

      return null;
    } catch (error) {
      console.error("Media stream handling error:", error);
      return null;
    }
  }

  private async processAudioChunk(
    media: MediaStreamMessage["media"]
  ): Promise<"human" | "machine" | "undecided" | null> {
    if (!media || this.isProcessing) {
      return null;
    }

    try {
      // Decode base64 audio
      const audioChunk = Buffer.from(media.payload, "base64");
      this.audioBuffer.push(audioChunk);
      this.bufferSize += audioChunk.length;

      // Check if we have enough audio for analysis (at least 2 seconds)
      if (this.bufferSize >= 2 * 16000) {
        // 2 seconds at 16kHz
        this.isProcessing = true;

        const result = await this.analyzeAudioBuffer();

        // Clear buffer after analysis
        this.audioBuffer = [];
        this.bufferSize = 0;
        this.isProcessing = false;

        return result;
      }

      return null;
    } catch (error) {
      console.error("Audio chunk processing error:", error);
      this.isProcessing = false;
      return null;
    }
  }

  private async analyzeAudioBuffer(): Promise<
    "human" | "machine" | "undecided"
  > {
    try {
      // Combine audio chunks
      const combinedBuffer = Buffer.concat(this.audioBuffer);

      // Convert to WAV format (simplified - in production use proper WAV encoding)
      const wavBuffer = this.rawToWav(combinedBuffer);

      // Send to HuggingFace service
      const result = await huggingfaceClient.predictAudioStream(
        new Uint8Array(wavBuffer)
      );

      console.log(
        `🎯 HuggingFace Analysis: ${result.label} (${result.confidence.toFixed(
          3
        )})`
      );

      // Return result based on confidence threshold
      if (result.confidence > 0.7) {
        return result.label;
      } else {
        return "undecided";
      }
    } catch (error) {
      console.error("Audio analysis error:", error);
      return "undecided";
    }
  }

  private async processRemainingAudio(): Promise<
    "human" | "machine" | "undecided"
  > {
    if (this.audioBuffer.length === 0 || this.bufferSize < 1 * 16000) {
      // Need at least 1 second
      return "undecided";
    }

    return await this.analyzeAudioBuffer();
  }

  private rawToWav(audioBuffer: Buffer): Buffer {
    // Simplified WAV conversion - in production use proper audio processing library
    const buffer = new ArrayBuffer(44 + audioBuffer.length);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + audioBuffer.length, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 16000 * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, audioBuffer.length, true);

    // Audio data
    const audioBytes = new Uint8Array(buffer, 44);
    audioBytes.set(new Uint8Array(audioBuffer));

    return Buffer.from(buffer);
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  cleanup() {
    this.audioBuffer = [];
    this.bufferSize = 0;
    this.isProcessing = false;
  }
}
