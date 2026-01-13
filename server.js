import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const CEREBRAS_BASE_URL = process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "llm-workshop-app" });
});

// (Extra dinámico) listar modelos disponibles en Cerebras (OpenAI-compatible)
app.get("/api/models", async (req, res) => {
  try {
    if (!CEREBRAS_API_KEY) {
      return res.status(500).json({ error: "Missing CEREBRAS_API_KEY" });
    }

    const r = await fetch(`${CEREBRAS_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${CEREBRAS_API_KEY}`
      }
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to list models", details: err?.message ?? String(err) });
  }
});

// Endpoint principal: ticketify (devuelve JSON en texto, y el front lo parsea)
app.post("/api/ticket", async (req, res) => {
  try {
    if (!CEREBRAS_API_KEY) {
      return res.status(500).json({ error: "Missing CEREBRAS_API_KEY" });
    }

    const { incidentText = "", temperature = 0.2, maxTokens = 350 } = req.body ?? {};
    if (!incidentText.trim()) {
      return res.status(400).json({ error: "incidentText is required" });
    }

    const system = `
Devuelve SOLO JSON válido (sin markdown, sin texto extra).
Idioma: español.
NO inventes datos. Si falta información, usa "unknown" o [].
Si hay dudas, añade preguntas en "questions_to_user".

Esquema JSON obligatorio:
{
  "title": string,
  "summary": string,
  "steps_to_reproduce": string[],
  "expected": string,
  "actual": string,
  "severity": "low" | "medium" | "high",
  "tags": string[],
  "questions_to_user": string[]
}
`.trim();

    const user = `INCIDENCIA:\n${incidentText}`;

    const payload = {
      model: CEREBRAS_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
      // JSON “legacy” (funciona bien con instrucción explícita)
      response_format: { type: "json_object" }
    };

    const r = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CEREBRAS_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    const content = data?.choices?.[0]?.message?.content ?? "";
    res.json({
      model: data?.model ?? CEREBRAS_MODEL,
      content,
      usage: data?.usage ?? null // prompt_tokens / completion_tokens / total_tokens
    });
  } catch (err) {
    res.status(500).json({ error: "Ticket generation failed", details: err?.message ?? String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});
