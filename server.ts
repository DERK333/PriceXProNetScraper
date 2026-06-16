import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined in Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

function cleanErrorMessage(err: any): string {
  if (!err) return "An unknown error occurred.";
  if (err.message) {
    const msg = err.message;
    if (msg.trim().startsWith("{") || msg.includes('{"error"')) {
      try {
        const startIndex = msg.indexOf("{");
        const jsonStr = msg.substring(startIndex);
        const parsed = JSON.parse(jsonStr);
        if (parsed?.error?.message) {
          return parsed.error.message;
        }
      } catch (e) {
        // Fallback
      }
    }
    return msg;
  }
  return typeof err === "string" ? err : JSON.stringify(err);
}

// Search Grounding prompt and API Endpoint
app.post("/api/scan", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Product query is required" });
    }

    const ai = getGeminiClient();

    const systemInstruction = 
      "You are a master real-time e-commerce price comparison and deal analysis engine. " +
      "Analyze the web search grounding results to locate exact matches or highly relevant matches for the user's product query. " +
      "Identify actual, active price offers from major e-commerce platforms (such as Amazon, Walmart, Best Buy, eBay, Target, Newegg, BH Photo, Costco, or similar regional portals). " +
      "Filter out irrelevant accessories (e.g., if user searches for a console, do not make an accessory like a controller the main offer). " +
      "Convert all prices to numbers. Extract exact direct URLs/links from the grounding search results so the customer can directly click them. " +
      "Ensure lowest_price is the lowest active of all deals you list. " +
      "Synthesize real-time pros and cons based on available user feedback or editorial consensus. " +
      "Suggest whether they should 'Buy Now', 'Wait', or if it's a 'Fair Deal' in the market_verdict. " +
      "Describe current availability of the item.";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Search, scan, and compare prices for: "${query}". Be extremely thorough to output accurate pricing across e-commerce.`,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            product_name: { type: Type.STRING },
            brand: { type: Type.STRING },
            description: { type: Type.STRING },
            lowest_price: { type: Type.NUMBER },
            average_price: { type: Type.NUMBER },
            price_range: { type: Type.STRING },
            currency: { type: Type.STRING },
            market_verdict: { type: Type.STRING },
            analysis_rationale: { type: Type.STRING },
            deals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  store_name: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  original_price: { type: Type.NUMBER },
                  deal_url: { type: Type.STRING, description: "URL link for the deal extracted from the web search results" },
                  shipping: { type: Type.STRING },
                  availability: { type: Type.STRING },
                  tag: { type: Type.STRING, description: "Short label like 'Best Buy', 'Lowest Price', 'Fast Delivery'" }
                },
                required: ["store_name", "price", "deal_url"]
              }
            },
            pros: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            cons: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            specifications: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  value: { type: Type.STRING }
                },
                required: ["key", "value"]
              }
            }
          },
          required: ["product_name", "lowest_price", "average_price", "deals"]
        }
      }
    });

    const text = response.text || "{}";
    let scanned_data;
    try {
      scanned_data = JSON.parse(text);
    } catch (parseErr) {
      console.error("JSON parsing failed, raw model output:", text);
      scanned_data = {
        product_name: query,
        lowest_price: 0,
        average_price: 0,
         error: "Failed to compile formatted results. Please try refining your keywords.",
        raw: text
      };
    }

    // Capture grounding sources/metadata directly
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map((chunk: any) => ({
        title: chunk.web?.title || "Search Reference",
        url: chunk.web?.uri || ""
      }))
      .filter((s: any) => s.url);

    res.json({
      scanned_data,
      sources: sources.slice(0, 10) // Send up to 10 key search references
    });

  } catch (err: any) {
    console.error("Error running price scan:", err);
    res.status(500).json({
      error: cleanErrorMessage(err) || "An error occurred while scanning e-commerce platforms."
    });
  }
});

// Real-Time Alert check endpoint
app.post("/api/check-alert", async (req, res) => {
  try {
    const { product_query, target_price } = req.body;
    if (!product_query || typeof product_query !== "string") {
      return res.status(400).json({ error: "Product query is required" });
    }
    const targetVal = Number(target_price);
    if (isNaN(targetVal)) {
      return res.status(400).json({ error: "Target price must be a valid number" });
    }

    const ai = getGeminiClient();

    const checkSystemInstruction = 
      "You are a real-time price monitoring assistant. " +
      "Perform research using Google Search grounding on the current active prices for the given query. " +
      "Identify the single absolute lowest price currently listed at authentic, mainstream online retailers (Amazon, Walmart, Best Buy, Target, Newegg, eBay New, B&H Photo, etc.). " +
      "Extract the name of the store, the absolute lowest price found, and the specific original merchant product URL from the grounding sources. " +
      "Determine if this lowest active price is less than or equal to the target_price provided by the user.";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Find lowest live price for "${product_query}". Check if it is at or below target price of $${targetVal}.`,
      config: {
        systemInstruction: checkSystemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            lowest_price_found: { type: Type.NUMBER },
            store_name: { type: Type.STRING },
            deal_url: { type: Type.STRING, description: "URL link for this lowest price extracted from search results" },
            triggered: { type: Type.BOOLEAN, description: "True if lowestColor is equal or less than user target_price" },
            rationale_summary: { type: Type.STRING, description: "Short 1-2 sentence description of the current status of prices for this product" }
          },
          required: ["lowest_price_found", "store_name", "deal_url", "triggered", "rationale_summary"]
        }
      }
    });

    const text = response.text || "{}";
    let alertEvaluation;
    try {
      alertEvaluation = JSON.parse(text);
    } catch (parseErr) {
      console.error("Alert JSON parsing failed:", text);
      alertEvaluation = {
        lowest_price_found: 0,
        store_name: "Web Aggregation",
        deal_url: "https://www.google.com",
        triggered: false,
        rationale_summary: "Live research search was carried out but format was corrupted."
      };
    }

    res.json({
      evaluation: alertEvaluation
    });

  } catch (err: any) {
    console.error("Error verifying price alert limit:", err);
    res.status(500).json({
      error: cleanErrorMessage(err) || "Could not execute real-time alert verification."
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
