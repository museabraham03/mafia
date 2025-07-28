import { GoogleGenAI } from "@google/genai";
import type { Phase } from "@shared/schema";

// DON'T DELETE THIS COMMENT
// Follow these instructions when using this blueprint:
// - Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
//   - do not change this unless explicitly requested by the user

// This API key is from Gemini Developer API Key, not vertex AI API Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface NarrativeContext {
  phase: Phase;
  dayNumber: number;
  players: number;
  previousEvents: string[];
  customPrompt?: string;
}

export async function generateNarrative(context: NarrativeContext, apiKey?: string): Promise<string> {
  try {
    const genAI = apiKey ? new GoogleGenAI({ apiKey }) : ai;
    
    let prompt = "";
    
    if (context.customPrompt) {
      prompt = `You are the narrator of a Mafia game set in the mysterious village of Shadowbrook. 
Current context: ${context.phase} ${context.dayNumber}, ${context.players} players.
Previous events: ${context.previousEvents.join(", ")}

Generate a dramatic narrative based on this custom prompt: ${context.customPrompt}

Keep the narrative atmospheric, mysterious, and engaging. Focus on the mood and setting rather than specific player actions.`;
    } else {
      switch (context.phase) {
        case 'DAY':
          prompt = `You are the narrator of a Mafia game set in the mysterious village of Shadowbrook. 
It is Day ${context.dayNumber} with ${context.players} players remaining.
Previous events: ${context.previousEvents.join(", ")}

Generate a dramatic narrative for the day phase. The villagers are gathering to discuss and vote. 
Create an atmospheric description of the village, the tension among the residents, and the growing suspicion.
Keep it mysterious and engaging, around 2-3 sentences.`;
          break;
          
        case 'NIGHT':
          prompt = `You are the narrator of a Mafia game set in the mysterious village of Shadowbrook.
It is Night ${context.dayNumber} with ${context.players} players remaining.
Previous events: ${context.previousEvents.join(", ")}

Generate a dramatic narrative for the night phase. Darkness falls over the village and sinister forces move in the shadows.
Create an atmospheric description of the night, the fear among residents, and the lurking danger.
Keep it mysterious and foreboding, around 2-3 sentences.`;
          break;
          
        case 'VOTING':
          prompt = `You are the narrator of a Mafia game set in the mysterious village of Shadowbrook.
It is the voting phase of Day ${context.dayNumber} with ${context.players} players remaining.
Previous events: ${context.previousEvents.join(", ")}

Generate a dramatic narrative for the voting phase. The villagers must decide who to eliminate.
Create tension around the difficult decision they face and the weight of their choice.
Keep it dramatic and suspenseful, around 2-3 sentences.`;
          break;
          
        default:
          prompt = `Generate a mysterious and atmospheric narrative for a Mafia game set in Shadowbrook village.
Current situation: ${context.phase} ${context.dayNumber}, ${context.players} players.
Keep it engaging and mysterious, around 2-3 sentences.`;
      }
    }

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "The shadows of Shadowbrook grow deeper as the mystery unfolds...";
  } catch (error) {
    console.error('Failed to generate narrative:', error);
    return "The village of Shadowbrook remains shrouded in mystery as the game continues...";
  }
}

export async function analyzeGameState(players: any[], events: string[], apiKey?: string): Promise<string> {
  try {
    const genAI = apiKey ? new GoogleGenAI({ apiKey }) : ai;
    
    const prompt = `You are analyzing a Mafia game in progress. 
Players: ${players.length} remaining
Recent events: ${events.slice(-5).join(", ")}

Provide a brief dramatic summary of the current state of the game, focusing on the atmosphere and tension.
Keep it mysterious and engaging, around 1-2 sentences.`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "The game continues with growing tension...";
  } catch (error) {
    console.error('Failed to analyze game state:', error);
    return "The mystery deepens in Shadowbrook...";
  }
}

export interface GameSummary {
  winner: string;
  summary: string;
  keyMoments: string[];
}

export async function generateGameSummary(
  winner: 'VILLAGERS' | 'MAFIA',
  players: any[],
  events: string[],
  apiKey?: string
): Promise<GameSummary> {
  try {
    const genAI = apiKey ? new GoogleGenAI({ apiKey }) : ai;
    
    const prompt = `You are concluding a Mafia game in Shadowbrook village.
Winner: ${winner}
Total players: ${players.length}
Game events: ${events.join(", ")}

Generate a dramatic conclusion narrative and identify 3 key moments from the game.
Respond with JSON in this format:
{
  "winner": "${winner}",
  "summary": "A dramatic 2-3 sentence conclusion narrative",
  "keyMoments": ["moment1", "moment2", "moment3"]
}`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            winner: { type: "string" },
            summary: { type: "string" },
            keyMoments: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["winner", "summary", "keyMoments"]
        }
      },
      contents: prompt,
    });

    const rawJson = response.text;
    if (rawJson) {
      const data: GameSummary = JSON.parse(rawJson);
      return data;
    } else {
      throw new Error("Empty response from model");
    }
  } catch (error) {
    console.error('Failed to generate game summary:', error);
    return {
      winner,
      summary: `The game concludes with ${winner.toLowerCase()} emerging victorious in the shadows of Shadowbrook.`,
      keyMoments: [
        "The game began with mystery and suspicion",
        "Tensions rose as accusations flew",
        `The ${winner.toLowerCase()} achieved their victory`
      ]
    };
  }
}
