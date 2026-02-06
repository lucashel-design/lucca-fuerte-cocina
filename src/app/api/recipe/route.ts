import OpenAI from "openai";
import { RecipeV1Schema } from "@/src/lib/recipe/schema";
import { createHash } from "crypto";
export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// --- Cache + Rate limit (MVP, memoria) ---
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const recipeCache = new Map<string, { ts: number; value: any }>();

const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 min
const RATE_MAX = 30; // 30 requests / 5 min / IP
const rateMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "local";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  if (entry.count >= RATE_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

function makeCacheKey(payload: unknown) {
  const raw = JSON.stringify(payload);
  return createHash("sha256").update(raw).digest("hex");
}

function cacheGet(key: string) {
  const hit = recipeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    recipeCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: any) {
  recipeCache.set(key, { ts: Date.now(), value });
}

type Prefs = {
  cuisine?: string;
  equipment?: {
    airfryer?: boolean;
    thermomix?: boolean;
    horno?: boolean;
    ollaExpress?: boolean;
  };
};

// Compacto que viene del cliente (Prep)
type BaseRecipeCompact = {
  title?: string;
  menuPitch?: string;
  timeMinutes?: number;
  servings?: number;
  ingredients?: string[];
  steps?: { text: string; timerSec: number }[];
};

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function buildAdaptMissingUserMessage(args: {
  basePrompt: string;
  baseRecipe: BaseRecipeCompact;
  missing: string[];
  userNote: string;
}) {
  const { basePrompt, baseRecipe, missing, userNote } = args;

  return `
${basePrompt ? `CONTEXTO ORIGINAL (no lo cambies):\n${basePrompt}\n\n` : ""}
${userNote ? `NOTA DEL USUARIO (ajuste fino, NO cambies el plato):\n${userNote}\n\n` : ""}
TAREA: ADAPTA la receta base. NO inventes una receta nueva.

RECETA BASE (resumen):
${JSON.stringify(baseRecipe)}

INGREDIENTES QUE FALTAN (PROHIBIDOS, NO USAR):
${missing.join(", ")}

REGLAS OBLIGATORIAS:
- Mantén la IDENTIDAD del plato (misma idea y estilo). No lo conviertas en "pollo" si era "garbanzos", por ejemplo.
- Si falta el ingrediente principal, sustitúyelo por uno de la MISMA FAMILIA (legumbre↔legumbre, verdura↔verdura, pescado↔pescado, carne↔carne). Nunca cambies a carne por defecto.
- Reescribe "ingredients" y "steps" para que la receta funcione con los sustitutos.
- Incluye 2–3 substitutes baratos, 1 trick, 1 errorCommon y 1 fix.
- Mantén 20 min y ingredientes comunes en España.
- Devuelve SOLO JSON válido del esquema (sin Markdown, sin texto extra).
`.trim();
}

function normalizeWow(recipe: any) {
  if (!recipe || typeof recipe !== "object") return recipe;

  // 1) Limpia wow y lo deja siempre como "Opcional: ..."
  const rawWow = String(recipe.wow ?? "").trim();

  const wowCore = rawWow
    .replace(/^Opcional\s*\(WOW\)\s*:\s*/i, "")
    .replace(/^Opcional\s*:\s*/i, "")
    .trim();

  const normalizedWow = wowCore ? `Opcional: ${wowCore}` : "";
  recipe.wow = normalizedWow;

  // 2) Fuerza que el step opcional WOW sea exactamente el mismo contenido (wowCore)
  if (Array.isArray(recipe.steps)) {
    recipe.steps = recipe.steps.filter((s: any) => {
      const t = String(s?.text ?? "");
      return !/^Opcional\s*\(WOW\)\s*:/i.test(t);
    });

    if (wowCore) {
      recipe.steps.push({
        text: `Opcional (WOW): ${wowCore}`,
        timerSec: 0,
      });
    }
  }

  return recipe;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Rate limit por IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return Response.json(
        { error: `Demasiadas peticiones. Prueba en ${rl.retryAfterSec}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const mode = String(body?.mode ?? "").trim();
    const isAdaptMissing = mode === "adapt_missing";

    const prefs: Prefs | undefined = body?.prefs;
    const basePrompt = String(body?.basePrompt ?? "").trim();
    const userNote = String(body?.userNote ?? "").trim();

    // userMessage normal (modo generación desde chat)
    let userMessage = String(body?.userMessage ?? "").trim();

    // ✅ modo adapt_missing: construimos userMessage desde baseRecipe + missing[]
    if (isAdaptMissing) {
      const baseRecipe = body?.baseRecipe as BaseRecipeCompact | undefined;
      const missing = toStringArray(body?.missing);

      if (!baseRecipe || typeof baseRecipe !== "object") {
        return Response.json({ error: "Falta baseRecipe para adaptar" }, { status: 400 });
      }
      if (missing.length === 0) {
        return Response.json({ error: "missing vacío (debe ser array de strings)" }, { status: 400 });
      }

      userMessage = buildAdaptMissingUserMessage({ basePrompt, baseRecipe, missing, userNote });
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Falta OPENAI_API_KEY en .env.local" }, { status: 500 });
    }
    if (!userMessage) {
      return Response.json({ error: "userMessage vacío" }, { status: 400 });
    }

    // Cache: mismas entradas => misma salida (reduce coste)
    const cacheKey = makeCacheKey({
      mode,
      userMessage,
      prefs,
      // incluimos estos campos porque afectan a la generación/adaptación
      basePrompt: String(body?.basePrompt ?? "").trim(),
      userNote: String(body?.userNote ?? "").trim(),
      baseRecipe: body?.baseRecipe ?? null,
      missing: body?.missing ?? null,
    });

    const cached = cacheGet(cacheKey);
    if (cached) {
      return Response.json({ recipe: cached, cached: true });
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

menuPitch:
- 1 sola frase, tono carta/menú (apetitoso y simple).
- No repitas el título ni uses comillas.
- Menciona 1-2 atributos reales (ej: “jugosa”, “crujiente”, “cremosa”, “fresquita”, “picantita suave”).
- Si el usuario pide Postre, debe sonar a postre (dulce, textura, frío/caliente).
- Evita “viral”, “increíble”, “brutal”, “te va a encantar” (marketing).

Incluye SIEMPRE:
- substitutes (2-3) baratos
- trick (1)
- errorCommon (1)
- fix (1 frase)
- wow (1)
- platingTips (2-3)
- steps con timerSec cuando aplique (0 si no aplica)
- Respeta servings si el usuario pone RACIONES: N y rellena servings con N.
- menuPitch (1 frase tipo carta: “jugoso, fácil, de 20 min”, sin sonar a marketing barato)

WOW (campo "wow"):
- Debe ser una IDEA OPCIONAL para impresionar, NO una opinión sobre el plato.
- Formato: 1–2 líneas, accionable (qué hacer y cuándo), y empieza por "Opcional:".
- Ejemplos válidos:
- "Opcional: al final añade queso rallado 2 min para un 'cheese pull'."
- "Opcional: termina con crujiente (pan rallado tostado) por encima justo al servir."
- "Opcional: marca el pollo 1 min extra al final para bordes más dorados."
- PROHIBIDO: frases tipo “queda espectacular”, “muy rico”, “se ve increíble” sin acción concreta.
Integración WOW en pasos:
- Añade SIEMPRE 1 paso opcional al final (antes de servir) que empiece por "Opcional (WOW):"
- Ese paso debe describir exactamente cómo ejecutar el wow.
- timerSec normalmente 0 (salvo que sea 1-2 min al final).

Preferencias del usuario:
- cocina=${cuisine}
- equipo=${equipmentList}
Adapta la receta y los pasos a ese equipo.

ESQUEMA JSON (respétalo):
{
  "title": "string",
  "menuPitch": "string",
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

    const systemFinal = isAdaptMissing
      ? `${system}\n\nREGLA EXTRA (ADAPTACIÓN): NO cambies el plato por otro. Mantén la identidad y solo ajusta ingredientes/pasos.`
      : system;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemFinal },
        { role: "user", content: userMessage },
      ],
      max_output_tokens: 700,
    });

    let text = (resp.output_text || "").trim();

    // Intento 1: parsear
    let recipe: any;

    // 1) Parse JSON (o intenta arreglar si no parsea)
    try {
      recipe = JSON.parse(text);
    } catch {
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

    // 2) Normaliza WOW (tu lógica actual)
    recipe = normalizeWow(recipe);

    // 3) Valida contra el schema (contrato real)
    let parsed = RecipeV1Schema.safeParse(recipe);

    if (!parsed.success) {
      // 1 intento de “repair” para encajar el schema (no solo JSON válido)
      const repair = await client.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "Ajusta el JSON para que cumpla EXACTAMENTE el schema indicado. Devuelve SOLO JSON válido, sin texto extra.",
          },
          {
            role: "user",
            content:
              `SCHEMA (descripción): RecipeV1.\n` +
              `JSON ACTUAL:\n${JSON.stringify(recipe)}\n\n` +
              `ERRORES:\n${JSON.stringify(parsed.error.flatten())}`,
          },
        ],
        max_output_tokens: 600,
      });

      const repairedText = (repair.output_text || "").trim();
      const repairedJson = JSON.parse(repairedText);
      const normalized = normalizeWow(repairedJson);

      parsed = RecipeV1Schema.safeParse(normalized);

      if (!parsed.success) {
        console.warn("La receta no cumple RecipeV1Schema", parsed.error.flatten());
        return Response.json(
          { error: "La receta generada no cumple el formato esperado. Prueba otra vez." },
          { status: 500 }
        );
      }
    }
    cacheSet(cacheKey, parsed.data);

    return Response.json({ recipe: parsed.data });

  } catch (err: any) {
    return Response.json(
      { error: "Error en /api/recipe", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
