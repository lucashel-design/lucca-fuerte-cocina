import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Prefs = {
  cuisine?: string;
  equipment?: {
    airfryer?: boolean;
    thermomix?: boolean;
    horno?: boolean;
    ollaExpress?: boolean;
  };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userMessage = String(body?.userMessage ?? "").trim();
    const prefs: Prefs | undefined = body?.prefs;

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Falta OPENAI_API_KEY en .env.local" }, { status: 500 });
    }
    if (!userMessage) {
      return Response.json({ error: "userMessage vacío" }, { status: 400 });
    }

    const cuisine = String(prefs?.cuisine || "Española");
    const eq = prefs?.equipment || {};
    const equipmentList =
      [
        eq.airfryer ? "airfryer" : null,
        eq.thermomix ? "thermomix" : null,
        eq.horno ? "horno" : null,
        eq.ollaExpress ? "olla exprés" : null,
      ]
        .filter(Boolean)
        .join(", ") || "sin equipo especial";

    const system = `
        Eres Lucca.Fuerte Cocina (chef colega, directo y práctico).
        Devuelve SOLO JSON válido. Sin Markdown. Sin texto extra.

        OBJETIVO: receta viral y fácil (España), 20 min, 4-6 ingredientes, 5-7 pasos.
        Medidas por defecto informales: "puñado", "vaso", "cucharada", "chorrito", "pizca".
        PROHIBIDO usar g/kg/ml/l (salvo repostería o si el usuario pide "modo exacto").

        Incluye SIEMPRE:
        - substitutes (2-3) baratos
        - trick (1)
        - errorCommon (1)
        - fix (1 frase)
        - wow (1)
        - platingTips (2-3)
        - steps con timerSec cuando aplique (0 si no aplica)
        - Respeta servings si el usuario pone RACIONES: N y rellena servings con N.

        WOW (campo "wow"):
        - Debe ser una IDEA OPCIONAL para impresionar, NO una opinión sobre el plato.
        - Formato: 1–2 líneas, accionable (qué hacer y cuándo), y empieza por "Opcional:".
        - Ejemplos válidos:
        - "Opcional: al final añade queso rallado 2 min para un 'cheese pull'."
        - "Opcional: termina con crujiente (pan rallado tostado) por encima justo al servir."
        - "Opcional: marca el pollo 1 min extra al final para bordes más dorados."
        - PROHIBIDO: frases tipo “queda espectacular”, “muy rico”, “se ve increíble” sin acción concreta.

        Preferencias del usuario:
        - cocina=${cuisine}
        - equipo=${equipmentList}
        Adapta la receta y los pasos a ese equipo.

        ESQUEMA JSON (respétalo):
        {
        "title": "string",
        "timeMinutes": number,
        "servings": number,
        "ingredients": [{"item":"string","amount":"string"}],
        "substitutes": [{"for":"string","instead":"string"}],
        "steps": [{"text":"string","timerSec":number}],
        "trick": "string",
        "errorCommon": "string",
        "fix": "string",
        "wow": "string",
        "platingTips": ["string","string","string"],
        "zeyraOptional": null
        }
        `.trim();

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      max_output_tokens: 700,
    });

    let text = (resp.output_text || "").trim();

    // Intento 1: parsear
    let recipe: any;
    try {
      recipe = JSON.parse(text);
    } catch {
      // Retry 1: “arregla el JSON” (solo 1 vez)
      const fix = await client.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "Convierte lo siguiente en JSON válido siguiendo EXACTAMENTE el esquema. Devuelve SOLO JSON. Sin Markdown.",
          },
          { role: "user", content: text },
        ],
        max_output_tokens: 500,
      });
      text = (fix.output_text || "").trim();
      recipe = JSON.parse(text);
    }

    return Response.json({ recipe });
  } catch (err: any) {
    return Response.json(
      { error: "Error en /api/recipe", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
