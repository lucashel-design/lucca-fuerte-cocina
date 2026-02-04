import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type CoachBody = {
  message?: string;          // lo que escribe el usuario
  screen?: "prep" | "cook";  // opcional
  recipe?: any;              // receta (puede ser compacta)
  stepIndex?: number;        // opcional (cook)
};

function clampString(s: string, max = 4000) {
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CoachBody;

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Falta OPENAI_API_KEY en .env.local" }, { status: 500 });
    }

    const message = String(body?.message ?? "").trim();
    if (!message) {
      return Response.json({ error: "message vacío" }, { status: 400 });
    }

    const screen = body?.screen ?? "prep";
    const stepIndex =
      typeof body?.stepIndex === "number" && Number.isFinite(body.stepIndex) ? body.stepIndex : null;

    // Receta puede venir completa o compacta; la limitamos para controlar coste.
    const recipe = body?.recipe ?? null;
    const recipeJson = recipe ? clampString(JSON.stringify(recipe), 3500) : "";

    const system = `
Eres Lucca.Fuerte Cocina (chef colega, directo y práctico).
Responde en español de España.
Tu misión: ayudar durante ${screen.toUpperCase()} con consejos ACCIONABLES.
- Respuestas cortas (máx 6-10 líneas).
- Si el usuario pide cambios, propón cambios concretos (qué y dónde).
- Si falta info, haz 1 pregunta corta.
- No inventes ingredientes raros ni tiempos imposibles.
- No uses Markdown.
`.trim();

    const user = `
CONTEXTO:
screen=${screen}${stepIndex !== null ? ` | stepIndex=${stepIndex}` : ""}
recipe=${recipeJson || "null"}

USUARIO:
${message}
`.trim();

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_output_tokens: 220,
    });

    const answer = (resp.output_text || "").trim();
    return Response.json({ message: answer || "No he podido responder. Prueba a reformularlo." });
  } catch (err: any) {
    return Response.json(
      { error: "Error en /api/coach", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
