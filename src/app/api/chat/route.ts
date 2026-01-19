import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userMessage = String(body?.userMessage ?? "").trim();
    const shortHistory = Array.isArray(body?.shortHistory) ? body.shortHistory : [];
    const prefs = body?.prefs;
    const cuisine = String(prefs?.cuisine || "Española");

    const eq = prefs?.equipment || {};
    const equipmentList = [
    eq.airfryer ? "airfryer" : null,
    eq.thermomix ? "thermomix" : null,
    eq.horno ? "horno" : null,
    eq.ollaExpress ? "olla exprés" : null,
    ].filter(Boolean).join(", ") || "sin equipo especial";

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Falta OPENAI_API_KEY en .env.local" }, { status: 500 });
    }

    if (!userMessage) {
      return Response.json({ error: "userMessage vacío" }, { status: 400 });
    }

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
        role: "system",
        content:
            "Eres Lucca.Fuerte Cocina: chef colega, directo y práctico.\n" +
            "RESPUESTA SIEMPRE CORTA, COMPLETA Y SIN RELLENO.\n\n" +
            "REGLAS:\n" +
            "- PROHIBIDO usar g, kg, ml, l (salvo si el usuario pide 'modo exacto' o es repostería). Usa puñado, vaso, cucharada, chorrito, pizca.\n" +
            "- Truco y Arreglo deben ser del plato actual (no consejos genéricos ni otro uso).\n" +
            "- Recetas: 4-6 ingredientes, 5-7 pasos, 1 línea por paso.\n" +
            "- Debe incluir SIEMPRE: Sustitutos (2-3), Truco (1), Error común (1), Cómo arreglarlo (1 frase), Momento wow (1).\n" +
            "- Prioriza 20 min e ingredientes fáciles en España.\n" +
            "- Si falta info, pregunta SOLO 1 cosa.\n\n" +
            "FORMATO (si es receta) — NO uses Markdown, solo líneas:\n" +
            "TITULO: ...\n" +
            "TIEMPO: ...\n" +
            "INGREDIENTES:\n" +
            "- ...\n" +
            "SUSTITUTOS:\n" +
            "- ...\n" +
            "PASOS:\n" +
            "1) ...\n" +
            "TRUCO: ...\n" +
            "ERROR: ...\n" +
            "ARREGLO: ...\n" +
            "WOW: ...\n\n" +
            "LIMITE: máximo 900 caracteres."
        },
        {
        role: "system",
        content: `Preferencias del usuario: cocina=${cuisine}. Equipo disponible: ${equipmentList}. Adapta la receta y los pasos a ese equipo.`,
        },
        ...shortHistory.slice(-6),
        { role: "user", content: userMessage },
      ],
      // Control de gasto por petición:
      max_output_tokens: 450,
    });

    let text = response.output_text || "";

    // Si se cuelan gramos/ml/litros, pedimos una única corrección (solo 1 retry)
    const hasExactUnits = /\b(\d+\s?(g|kg|ml|l))\b/i.test(text);
    if (hasExactUnits) {
    const fix = await client.responses.create({
        model: "gpt-4o-mini",
        input: [
        {
            role: "system",
            content:
            "Reescribe el texto manteniendo EXACTAMENTE el mismo formato, pero elimina TODA unidad g/kg/ml/l y reemplaza por medidas informales (puñado/vaso/cucharada/chorrito/pizca). Mantén truco/error/arreglo/wow contextual al plato. No añadas nada extra.",
        },
        { role: "user", content: text },
        ],
        max_output_tokens: 250,
    });

    text = fix.output_text || text;
    }

    return Response.json({ text });
    } catch (err: any) {

    return Response.json(
      { error: "Error en /api/chat", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
