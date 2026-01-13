
const BASE_URL = "https://api.cerebras.ai/v1"; // Base URL Cerebras (OpenAI-compatible) :contentReference[oaicite:2]{index=2}
const API_KEY = "csk-hcnft3c9tnv2vpefe2fv353yw6p5mtn8mkhjky9kpvyc5ywn";

async function listModels() {
  const res = await fetch(`${BASE_URL}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`, // Bearer auth :contentReference[oaicite:3]{index=3}
    },
  });

  if (!res.ok) {
    throw new Error(`Error listando modelos: ${res.status} ${res.statusText}\n${await res.text()}`);
  }

  return res.json();
}

async function chatOnce(userMessage) {
  const body = {
    model: "llama3.1-8b", // ejemplo de model id :contentReference[oaicite:5]{index=5}
    messages: [{ role: "user", content: userMessage }],
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`, // Bearer auth :contentReference[oaicite:6]{index=6}
      "User-Agent": "api-demo/1.0",       // Recomendación si CloudFront bloquea :contentReference[oaicite:7]{index=7}
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Error en chat: ${res.status} ${res.statusText}\n${await res.text()}`);
  }

  return res.json();
}

(async () => {
  console.log("== 1) GET /models (ver qué ofrece la API) ==");
  const models = await listModels();
  console.log(models);

  console.log("\n== 2) POST /chat/completions (pedir una respuesta) ==");
  const completion = await chatOnce("Why is fast inference important?");
  // Estructura estilo OpenAI: choices[0].message.content (habitual en APIs compatibles) :contentReference[oaicite:8]{index=8}
  console.log(completion.choices?.[0]?.message?.content ?? completion);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
