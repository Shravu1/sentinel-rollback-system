
import { GoogleGenAI, Type } from "@google/genai";
import { LogEntry, MetricPoint, AnalysisResult, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeDeploymentHealth = async (
  logs: LogEntry[],
  metrics: MetricPoint[],
  currentVersion: string,
  previousVersion: string
): Promise<AnalysisResult> => {
  const prompt = `
    As an expert Site Reliability Engineer (SRE), analyze the health of version ${currentVersion}.
    Compare current metrics against the previous stable version ${previousVersion}.
    
    RECENT LOGS:
    ${logs.slice(0, 10).map((l, i) => `[ID:${i}] [${l.level}] ${l.message}`).join('\n')}

    RECENT METRICS (Past 10 cycles):
    ${metrics.slice(-10).map(m => `Latency: ${m.latency}ms, Errors: ${m.errors}, CPU: ${m.cpu}%`).join('\n')}

    Identify if any logs are "Suspect" (likely root cause). 
    Return a structured JSON report including riskScore (0-100), recommendation (STAY, ROLLBACK, INVESTIGATE),
    detailed reasoning, suspectLogIndices, a list of detectedAnomalies, and an impactAssessment.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskScore: { type: Type.NUMBER },
            recommendation: { type: Type.STRING, enum: ['STAY', 'ROLLBACK', 'INVESTIGATE'] },
            reasoning: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            suggestedVersion: { type: Type.STRING },
            suspectLogIndices: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            detectedAnomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
            impactAssessment: { type: Type.STRING }
          },
          required: ['riskScore', 'recommendation', 'reasoning', 'confidence', 'detectedAnomalies', 'impactAssessment']
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Analysis Error:", error);
    return { 
      riskScore: 50, 
      recommendation: 'INVESTIGATE', 
      reasoning: "AI Service Error during deep inspection.", 
      confidence: 0,
      detectedAnomalies: ["System Timeout"],
      impactAssessment: "Unknown impact due to processing error."
    };
  }
};

export const chatWithSRE = async (
  history: ChatMessage[],
  currentContext: { logs: LogEntry[], metrics: MetricPoint[] }
): Promise<string> => {
  const prompt = `
    You are the Sentinel SRE AI Assistant. You have access to real-time system state.
    CURRENT LOGS: ${currentContext.logs.slice(-5).map(l => l.message).join(' | ')}
    LATEST LATENCY: ${currentContext.metrics[currentContext.metrics.length-1]?.latency}ms
    
    Answer the user's question about the system state concisely and professionally. Focus on root cause and remediation.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { text: prompt },
        ...history.map(m => ({ text: `${m.role.toUpperCase()}: ${m.content}` }))
      ]
    });
    return response.text || "I'm having trouble connecting to the kernel.";
  } catch (e) {
    return "Kernel communication error. Please retry.";
  }
};
