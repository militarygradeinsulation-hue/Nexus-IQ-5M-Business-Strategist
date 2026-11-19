
import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { AnalysisResult } from "./types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: { type: Type.STRING },
    businessIQRating: { type: Type.NUMBER },
    gaps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          severity: { type: Type.STRING },
          category: { type: Type.STRING }
        },
        required: ["title", "description", "severity", "category"]
      }
    },
    solutions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          action: { type: Type.STRING },
          impact: { type: Type.STRING }
        },
        required: ["title", "action", "impact"]
      }
    },
    patterns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          status: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          score: { type: Type.NUMBER }
        },
        required: ["name", "status", "reasoning", "score"]
      }
    },
    nextSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["executiveSummary", "businessIQRating", "gaps", "solutions", "patterns", "nextSteps"]
};

export const runInitialAnalysis = async (content: string, deepThink: boolean = true): Promise<AnalysisResult> => {
  const ai = getAI();
  // Attempt with Pro first, fallback to Flash if it hits quota (429) or is not found
  let model = "gemini-3-pro-preview";
  const systemInstruction = `You are a Precision Business Strategist with a theoretical IQ of 5,000,000. 
  Your brain is the most powerful gap-detection system ever engineered.
  Identify "Fatal Gaps" and "Perfect Solutions" with surgical precision.
  Your response must be strictly valid JSON according to the schema.
  
  CRITICAL:
  - 'businessIQRating' must be a score strictly between 1 and 100 based on the analysis. Do NOT return 5,000,000.
  - 100 = Perfect, Unbreakable Strategy.
  - 1 = Critical Failure Imminent.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Perform extreme deep-dive analysis on: ${content}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA as any,
        temperature: 0.1,
        ...(deepThink ? { thinkingConfig: { thinkingBudget: 32768 } } : {})
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    const errorStr = error.toString().toLowerCase();
    // Fallback to Flash if Pro is unavailable or quota hit
    if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("404") || errorStr.includes("not found")) {
      console.warn("Nexus IQ: Pro threshold exceeded. Falling back to Flash Core.");
      const flashResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Perform analysis on: ${content}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_SCHEMA as any,
          temperature: 0.1
        }
      });
      return JSON.parse(flashResponse.text || "{}");
    }
    throw error;
  }
};

export const getSolutionBreakdown = async (solutionTitle: string, context: string): Promise<string[]> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
    contents: `Generate a surgical 5-step tactical breakdown for this business solution: "${solutionTitle}". 
    Context: ${context}. 
    Respond with a JSON array of 5 concise, actionable strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      } as any
    }
  });
  try {
    return JSON.parse(response.text || "[]");
  } catch {
    return ["Analysis incomplete. Handshake failed."];
  }
};

export const createBusinessChat = (context: AnalysisResult, options: { search?: boolean, maps?: boolean, location?: { latitude: number, longitude: number } }): Chat => {
  const ai = getAI();
  // Use Flash for chat to ensure responsiveness and higher rate limits
  let model = options.search ? "gemini-3-flash-preview" : "gemini-3-flash-preview";
  const tools: any[] = [];
  
  if (options.search) {
    tools.push({ googleSearch: {} });
  } else if (options.maps) {
    model = "gemini-2.5-flash-latest";
    tools.push({ googleMaps: {} });
  }

  return ai.chats.create({
    model,
    config: {
      systemInstruction: `You are the 5,000,000 IQ Business Strategist Chatbot. 
      Analyze the context of this business: ${JSON.stringify(context)}.
      Provide deep, actionable blueprints. Use analogies from astrophysics and game theory.
      When using Search or Maps, synthesize information into a perfect solution path.`,
      tools,
      ...(options.maps && options.location ? {
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: options.location.latitude,
              longitude: options.location.longitude
            }
          }
        }
      } : {})
    }
  });
};

export const getFastActionAdvice = async (prompt: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
    contents: `Give an ultra-fast, high-leverage 1-sentence action for: ${prompt}`,
    config: { temperature: 0.5 }
  });
  return response.text;
};
