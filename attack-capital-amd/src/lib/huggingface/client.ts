interface HuggingFacePrediction {
  label: "human" | "machine";
  confidence: number;
  human_confidence: number;
  machine_confidence: number;
  audio_duration: number;
  processing_time: number;
}

class HuggingFaceClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl =
      process.env.HUGGINGFACE_SERVICE_URL || "http://localhost:8000";
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      return response.ok;
    } catch (error) {
      console.error("HuggingFace health check failed:", error);
      return false;
    }
  }

  async predictAudio(audioBuffer: Buffer): Promise<HuggingFacePrediction> {
    try {
      // Convert buffer to blob for FormData
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", blob, "audio.wav");

      const response = await fetch(`${this.baseUrl}/predict`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.prediction;
    } catch (error) {
      console.error("HuggingFace prediction error:", error);
      throw error;
    }
  }

  async predictAudioStream(
    audioBuffer: Buffer
  ): Promise<HuggingFacePrediction> {
    try {
      const response = await fetch(`${this.baseUrl}/predict-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: audioBuffer,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("HuggingFace stream prediction error:", error);
      throw error;
    }
  }
}

export const huggingfaceClient = new HuggingFaceClient();
