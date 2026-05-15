import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.warn("Firebase Admin failed to initialize with default credentials. Some backend features may be limited.");
  }
}

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/sync-candidate", async (req, res) => {
    const { candidateName, currentOffice, state } = req.body;
    
    if (!candidateName) {
      return res.status(400).json({ error: "Candidate name is required" });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Fetch the 10 most recent (2024-2026) key votes, an updated short biography, and political sentiment analysis for ${candidateName}, who is a candidate for ${currentOffice} in ${state || 'the US'}. 
        Return the data in the following JSON format:
        {
          "biography": "short bio strings",
          "keyVotes": [
            { "bill": "Bill Name/Description", "vote": "Yea" | "Nay" | "Present" | "Support" | "Lead" | "Chair" | "Author", "impact": "Short impact description", "url": "Reference URL", "date": "YYYY-MM-DD" }
          ],
          "sentimentData": [
            { "category": "Category name", "value": 0-100 }
          ]
        }`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              biography: { type: Type.STRING },
              keyVotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    bill: { type: Type.STRING },
                    vote: { type: Type.STRING, enum: ["Yea", "Nay", "Present", "Support", "Lead", "Chair", "Author"] },
                    impact: { type: Type.STRING },
                    url: { type: Type.STRING },
                    date: { type: Type.STRING }
                  },
                  required: ["bill", "vote", "impact", "url", "date"]
                }
              },
              sentimentData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    value: { type: Type.NUMBER }
                  },
                  required: ["category", "value"]
                }
              }
            },
            required: ["biography", "keyVotes", "sentimentData"]
          }
        }
      });

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error: any) {
      console.error("Gemini Sync Error:", error);
      
      // Pass through rate limit errors
      if (error?.status === 429 || error?.code === 429 || (error?.message && error.message.includes('429'))) {
        return res.status(429).json({ error: "Gemini API rate limit exceeded. Please try again in 60 seconds." });
      }
      
      res.status(500).json({ error: "Failed to sync candidate data" });
    }
  });

  // Example Firebase Admin route
  app.get("/api/verify-session", async (req, res) => {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(401).json({ error: "No token provided" });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      res.json({ uid: decodedToken.uid });
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
