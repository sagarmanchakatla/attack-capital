import { GoogleGenerativeAI } from "@google/generative-ai";

interface GeminiPrediction {
  label: "human" | "machine";
  confidence: number;
  reasoning: string;
  processing_time: number;
  cost_estimate: number;
  tokens_used: number;
  audio_duration?: number;
  detectionPattern?: string;
  audioQuality?: string;
  callEnvironment?: string;
}

interface GeminiHealth {
  status: "healthy" | "unhealthy";
  model_available: boolean;
  api_key_configured: boolean;
  model_name: string;
}

class GeminiClient {
  private genAI: GoogleGenerativeAI | null = null;
  private modelName: string = "gemini-2.5-flash"; // Use 1.5-flash as 2.5 might not be available yet

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async healthCheck(): Promise<GeminiHealth> {
    if (!this.genAI) {
      return {
        status: "unhealthy",
        model_available: false,
        api_key_configured: false,
        model_name: this.modelName,
      };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      // Use a simpler test that's more likely to work
      const result = await model.generateContent("Say 'OK' if working");

      return {
        status: "healthy",
        model_available: true,
        api_key_configured: true,
        model_name: this.modelName,
      };
    } catch (error) {
      console.error("Gemini health check failed:", error);
      return {
        status: "unhealthy",
        model_available: false,
        api_key_configured: true,
        model_name: this.modelName,
      };
    }
  }

  async analyzeTranscript(
    transcript: string,
    audioDuration: number
  ): Promise<GeminiPrediction> {
    const startTime = Date.now();

    if (!this.genAI) {
      throw new Error("Gemini API not configured");
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 150,
        },
      });

      const isNoisyAudio = transcript.length < 10; // Simple noise detection
      const optimizedTranscript =
        transcript.length > 500
          ? transcript.substring(0, 500) + "..."
          : transcript;

      const prompt = isNoisyAudio
        ? this.getFallbackPrompt(optimizedTranscript)
        : this.getStandardPrompt(optimizedTranscript, audioDuration);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const parsed = this.parseGeminiResponse(text);
      const processingTime = Date.now() - startTime;

      // Get token count safely
      let tokensUsed = 100;
      try {
        // @ts-ignore - usageMetadata might not be in types yet
        tokensUsed = response.usageMetadata?.totalTokenCount || 100;
      } catch (e) {
        console.log("Could not get token count, using default");
      }

      return {
        ...parsed,
        processing_time: processingTime,
        cost_estimate: this.calculateCostEstimate(tokensUsed),
        tokens_used: tokensUsed,
        audio_duration: audioDuration,
        detectionPattern: "gemini_analysis",
        audioQuality: isNoisyAudio ? "low" : "good",
        callEnvironment: "telephony",
      };
    } catch (error) {
      console.error("Gemini transcript analysis error:", error);
      throw error;
    }
  }

  private getStandardPrompt(transcript: string, audioDuration: number): string {
    return `
AMD DETECTION ANALYSIS - TELEPHONY AUDIO

CALL TRANSCRIPT:
"${transcript}"

AUDIO METADATA:
- Duration: ${audioDuration.toFixed(1)} seconds
- Source: Outbound telephone call

ANALYSIS TASK:
Determine if this audio contains a HUMAN or MACHINE/VOICEMAIL.

CRITICAL: Respond with ONLY valid JSON in this exact format:
{
  "label": "human" or "machine",
  "confidence": 0.95,
  "reasoning": "brief technical explanation"
}

ANALYSIS GUIDELINES:
HUMAN INDICATORS:
- Natural conversation flow
- Spontaneous responses
- Conversational fillers ("um", "ah")
- Background noise variations
- Interactive dialogue patterns

MACHINE INDICATORS:
- Scripted/robotic speech
- Repetitive greetings
- Beep tones
- Consistent pacing/tone
- Standardized messages

Be accurate and conservative in confidence scoring.
Focus on speech patterns and content, not just transcript length.
    `;
  }

  private getFallbackPrompt(transcript: string): string {
    return `
AMD Analysis - Noisy/Low-quality Audio
Transcript: "${transcript}"
Human or Machine? JSON: {"label":"human|machine","confidence":0.0-1.0,"reasoning":"brief"}
    `;
  }

  private parseGeminiResponse(
    text: string
  ): Omit<
    GeminiPrediction,
    "processing_time" | "cost_estimate" | "tokens_used"
  > {
    try {
      // Clean the text first
      const cleanText = text.trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.label && ["human", "machine"].includes(parsed.label)) {
          return {
            label: parsed.label,
            confidence: Math.max(0.1, Math.min(1.0, parsed.confidence || 0.5)),
            reasoning: parsed.reasoning || "Analysis completed",
          };
        }
      }

      // Fallback text parsing
      const lowerText = cleanText.toLowerCase();
      if (lowerText.includes("human") && !lowerText.includes("machine")) {
        return {
          label: "human",
          confidence: 0.7,
          reasoning: "Text analysis indicated human characteristics",
        };
      } else if (
        lowerText.includes("machine") ||
        lowerText.includes("voicemail") ||
        lowerText.includes("answering")
      ) {
        return {
          label: "machine",
          confidence: 0.7,
          reasoning: "Text analysis indicated machine characteristics",
        };
      }

      throw new Error("Could not parse response");
    } catch (error) {
      console.error("Failed to parse Gemini response:", error);
      console.error("Raw response was:", text);
      return {
        label: "human",
        confidence: 0.5,
        reasoning: "Fallback analysis due to parsing error",
      };
    }
  }

  private calculateCostEstimate(tokens: number): number {
    // Gemini 1.5 Flash pricing
    const inputCost = (tokens * 0.75) / 1000000;
    const outputCost = (50 * 3.0) / 1000000;
    return inputCost + outputCost;
  }

  getModelInfo() {
    return {
      model_name: this.modelName,
      features: ["llm_reasoning", "transcript_analysis", "cost_optimized"],
      status: "live",
    };
  }
}

export const geminiClient = new GeminiClient();
