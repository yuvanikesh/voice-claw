import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load env variables
dotenv.config();

// Create Express app
const app = express();
const PORT = 3000;

// Enable body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic Agent Config Storage
interface AgentConfig {
  business_name: string;
  greeting: string;
  business_type?: string;
  primary_language?: string;
  top_faqs?: string[];
  restrictions?: string;
  pdf_name?: string;
  url?: string;
  files?: string[];
  urls?: string[];
}

const agents: Record<string, AgentConfig> = {
  "demo123": {
    business_name: "Sri Lakshmi Hotel",
    greeting: "Namaste, how can I help you?",
    business_type: "restaurant",
    primary_language: "te-IN / English",
    top_faqs: ["Veg biryani cost", "Signature dishes", "Paneer Pulao availability"],
    restrictions: "Do not mention beef or non-veg food options."
  }
};

/**
 * Helper to generate a valid WAV PCM buffer in-memory
 * Fills it with a smooth 440Hz sine wave that fades out so the user actually hears a voice sound.
 */
function generateSynthesizedWav(): Buffer {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const audioDurationSec = 1.2;
  const numSamples = Math.floor(sampleRate * audioDurationSec);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const subChunk2Size = numSamples * blockAlign;
  const chunkSize = 36 + subChunk2Size;

  const buffer = Buffer.alloc(44 + subChunk2Size);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // Format type (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(subChunk2Size, 40);

  // Populate data with a harmonic double-tone sound resembling a synthetic voice humming
  const baseHz = 280; // Synth tone
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Multi-harmonic wave for a more rich "robotic voice hum" instead of a flat sine beep
    const waveValue = Math.sin(2 * Math.PI * baseHz * t) + 0.4 * Math.sin(2 * Math.PI * (baseHz * 1.5) * t);
    
    // Envelope to fade in slightly and fade out smoothly (resembling word utterance window)
    let envelope = 1;
    if (t < 0.2) {
      envelope = t / 0.2; // linear fade in
    } else if (t > 0.8) {
      envelope = Math.max(0, 1 - (t - 0.8) / 0.4); // linear fade out
    }
    
    const sample = Math.floor(waveValue * 12000 * envelope);
    // Clamp to 16-bit bounds
    const clampedSample = Math.max(-32768, Math.min(32767, sample));
    buffer.writeInt16LE(clampedSample, 44 + i * 2);
  }

  return buffer;
}

// ==========================================
// API ROUTES
// ==========================================

// POST /api/upload -> { success: true, file_id: string }
app.post("/api/upload", (req, res) => {
  const file_id = "file_" + Math.random().toString(36).substring(2, 11);
  console.log(`[API] File uploaded successfully, assigned file_id: ${file_id}`);
  res.json({ success: true, file_id });
});

// POST /api/ingest-url -> { success: true }
app.post("/api/ingest-url", (req, res) => {
  const { url } = req.body;
  console.log(`[API] Ingesting URL: ${url}`);
  res.json({ success: true, url });
});

// POST /api/config -> { agent_id }
app.post("/api/config", (req, res) => {
  const { business_name, greeting, business_type, primary_language, top_faqs, restrictions, files, urls } = req.body;
  if (!business_name) {
    return res.status(400).json({ error: "business_name is required" });
  }

  // Create or update unique agent
  const agent_id = "agent_" + Math.random().toString(36).substring(2, 9);
  agents[agent_id] = {
    business_name,
    greeting: greeting || "Namaste, how can I help you?",
    business_type,
    primary_language,
    top_faqs: top_faqs || [],
    restrictions: restrictions || "",
    files: files || [],
    urls: urls || []
  };

  console.log(`[API] Deployed agent '${agent_id}' for '${business_name}'`);
  res.json({ agent_id });
});

// POST /api/chat -> Conversational onboarding proxy with multi-model support (primary + Gemini fallback)
app.post("/api/chat", async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // 1. Try primary LLM API if AI_API_KEY is available
  const aiApiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const aiModel = process.env.AI_MODEL || "claude-3-5-sonnet-20241022";
  if (aiApiKey) {
    try {
      console.log("[AI Proxy] Calling primary LLM API...");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": aiApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          max_tokens: 1000,
          system: system,
          messages: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      } else {
        const statusText = await response.text();
        console.warn(`[AI Proxy] Primary LLM returned non-ok status: ${response.status} - ${statusText}`);
      }
    } catch (e) {
      console.error("[AI Proxy] Primary LLM connection error:", e);
    }
  }

  // 2. Gemini fallback when primary key is absent
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.warn("[AI Proxy] No AI keys configured. Responding with local fallback...");
      return res.json({
        content: [
          {
            type: "text",
            text: "Hello! Set up GEMINI_API_KEY or AI_API_KEY in Settings > Secrets to enable smart interactive AI onboarding."
          }
        ]
      });
    }

    console.log("[AI Proxy] Invoking Gemini fallback...");
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    // Translate chat history roles to Google's model / user roles
    const contents = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    const geminiRes = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: system,
        temperature: 0.7,
      }
    });

    return res.json({
      content: [
        {
          type: "text",
          text: geminiRes.text || "Perfect! Ready to move next."
        }
      ]
    });
  } catch (err: any) {
    console.error("[AI Proxy] Gemini generation error:", err);
    return res.status(500).json({ error: "Failed to connect to AI server. Please verify your settings." });
  }
});

// GET /api/agent/:id
app.get("/api/agent/:id", (req, res) => {
  const { id } = req.params;
  const config = agents[id] || agents["demo123"];
  console.log(`[API] Fetching agent metadata for '${id}' -> '${config.business_name}'`);
  res.json(config);
});

// POST /api/stt -> { text, source_lang }
app.post("/api/stt", (req, res) => {
  // We can see if the query has dynamic overrides, or return the standard response
  console.log("[API] Transcribing voice input...");
  res.json({ 
    text: "do you have veg biryani", 
    source_lang: "te-IN" 
  });
});

// POST /api/query -> { answer_text }
app.post("/api/query", (req, res) => {
  const { text, source_lang, agent_id } = req.body;
  const agent = agents[agent_id] || agents["demo123"];
  const query = (text || "").toLowerCase();

  let answer_text = "";
  if (query.includes("biryani") || query.includes("veg")) {
    answer_text = "Yes, we have veg biryani available for ₹120.";
  } else if (query.includes("menu") || query.includes("price") || query.includes("cost")) {
    answer_text = "Our simple menu features our Signature Veg Biryani for ₹120, Paneer Pulao for ₹140, and Lemon Rice for ₹80.";
  } else {
    answer_text = `Thank you for your interest in ${agent.business_name}! I am happy to help you with any questions.`;
  }

  console.log(`[API] Query: '${text}' | Response: '${answer_text}'`);
  res.json({ answer_text });
});

// POST /api/tts -> Audio wav binary stream representation
app.post("/api/tts", (req, res) => {
  const { text } = req.body;
  console.log(`[API] Synthesizing speech for: '${text || "(nothing)"}'`);

  const wavBuffer = generateSynthesizedWav();
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", wavBuffer.length);
  res.send(wavBuffer);
});

// ==========================================
// VITE AND STATIC SERVING
// ==========================================

async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Loading Vite dev middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving build files statically from dist/ directory...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VoiceClaw] Server running on http://localhost:${PORT}`);
  });
}

setupServer().catch(err => {
  console.error("Failed to start full-stack server:", err);
});
