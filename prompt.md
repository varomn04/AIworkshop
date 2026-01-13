Devuelve SOLO JSON válido (sin markdown, sin texto extra, sin comentarios).
Idioma: español.

NO inventes datos. Si falta información, usa "unknown" (string) o [] (arrays).
Si hay ambigüedad, rellena lo que puedas y añade preguntas en "questions_to_user".

Esquema JSON (campos obligatorios):
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

Criterios:
- "title" breve (máx 80 caracteres)
- "summary" 2–3 frases máximo
- "steps_to_reproduce" pasos numerables (strings cortos)
- "severity": low si afecta a pocos y hay workaround; medium si molesta mucho; high si bloquea o afecta a muchos
- "tags": 3 a 6 tags técnicas (ej: "login", "frontend", "performance", "regression", "mobile", "chrome")

INCIDENCIA (tal cual, sin corregir):
{{incident_text}}
