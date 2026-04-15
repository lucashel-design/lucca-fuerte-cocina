import OpenAI from "openai";
import { RecipeV1Schema } from "@/src/lib/recipe/schema";
import { createHash, randomUUID } from "crypto";
import { debugError } from "@/src/lib/debug";

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

  const rawWow = String(recipe.wow ?? "").trim();

  const wowCore = rawWow
    .replace(/^Opcional\s*\(WOW\)\s*:\s*/i, "")
    .replace(/^Opcional\s*:\s*/i, "")
    .trim();

  const normalizedWow = wowCore ? `Opcional: ${wowCore}` : "";
  recipe.wow = normalizedWow;

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
  const requestId = randomUUID();

  try {
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      debugError("api_recipe_body_parse", { requestId, error: e });
      return Response.json({ error: "Body inválido (no es JSON)", requestId }, { status: 400 });
    }

    // Rate limit por IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return Response.json(
        { error: `Demasiadas peticiones. Prueba en ${rl.retryAfterSec}s.`, requestId },
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
        return Response.json({ error: "Falta baseRecipe para adaptar", requestId }, { status: 400 });
      }
      if (missing.length === 0) {
        return Response.json({ error: "missing vacío (debe ser array de strings)", requestId }, { status: 400 });
      }

      userMessage = buildAdaptMissingUserMessage({ basePrompt, baseRecipe, missing, userNote });
    }

    if (!process.env.OPENAI_API_KEY) {
      debugError("api_recipe_missing_key", { requestId });
      return Response.json({ error: "Falta OPENAI_API_KEY en .env.local", requestId }, { status: 500 });
    }
    if (!userMessage) {
      return Response.json({ error: "userMessage vacío", requestId }, { status: 400 });
    }

    // Cache: mismas entradas => misma salida (reduce coste)
    const cacheKey = makeCacheKey({
      mode,
      userMessage,
      prefs,
      basePrompt: String(body?.basePrompt ?? "").trim(),
      userNote: String(body?.userNote ?? "").trim(),
      baseRecipe: body?.baseRecipe ?? null,
      missing: body?.missing ?? null,
    });

    const cached = cacheGet(cacheKey);
    if (cached) {
      return Response.json({ recipe: cached, cached: true, requestId });
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

    let resp: any;
    try {
      resp = await client.responses.create({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: systemFinal },
          { role: "user", content: userMessage },
        ],
        max_output_tokens: 700,
      });
    } catch (e) {
      debugError("api_recipe_openai_call", { requestId, error: e, mode });
      return Response.json({ error: "Error llamando a OpenAI", requestId }, { status: 502 });
    }

    let text = String(resp?.output_text || "").trim();
    if (!text) {
      debugError("api_recipe_empty_output", { requestId, mode });
      return Response.json({ error: "OpenAI devolvió una respuesta vacía", requestId }, { status: 502 });
    }

    // 1) Parse JSON (o intenta arreglar si no parsea)
    let recipe: any;

    try {
      recipe = JSON.parse(text);
    } catch (e) {
      debugError("api_recipe_json_parse", { requestId, error: e, snippet: text.slice(0, 200) });

      let fixResp: any;
      try {
        fixResp = await client.responses.create({
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
      } catch (e2) {
        debugError("api_recipe_json_fix_call", { requestId, error: e2 });
        return Response.json({ error: "Error intentando reparar el JSON", requestId }, { status: 502 });
      }

      text = String(fixResp?.output_text || "").trim();

      try {
        recipe = JSON.parse(text);
      } catch (e3) {
        debugError("api_recipe_json_fix_parse", { requestId, error: e3, snippet: text.slice(0, 200) });
        return Response.json({ error: "JSON inválido tras reparación", requestId }, { status: 502 });
      }
    }

    // 2) Normaliza WOW
    try {
      recipe = normalizeWow(recipe);
    } catch (e) {
      debugError("api_recipe_normalize_wow", { requestId, error: e });
    }

    // 3) Valida contra el schema (contrato real)
    let parsed = RecipeV1Schema.safeParse(recipe);

    if (!parsed.success) {
      debugError("api_recipe_schema_invalid", {
        requestId,
        errors: parsed.error.flatten(),
        mode,
      });

      // 1 intento de “repair” para encajar el schema (no solo JSON válido)
      let repairResp: any;
      try {
        repairResp = await client.responses.create({
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
      } catch (e) {
        debugError("api_recipe_schema_repair_call", { requestId, error: e });
        return Response.json({ error: "Error intentando reparar el schema", requestId }, { status: 502 });
      }

      const repairedText = String(repairResp?.output_text || "").trim();
      let repairedJson: any;
      try {
        repairedJson = JSON.parse(repairedText);
      } catch (e) {
        debugError("api_recipe_schema_repair_parse", { requestId, error: e, snippet: repairedText.slice(0, 200) });
        return Response.json({ error: "JSON inválido tras reparación de schema", requestId }, { status: 502 });
      }

      const normalized = normalizeWow(repairedJson);
      parsed = RecipeV1Schema.safeParse(normalized);

      if (!parsed.success) {
        debugError("api_recipe_schema_still_invalid", { requestId, errors: parsed.error.flatten() });
        console.warn("La receta no cumple RecipeV1Schema", parsed.error.flatten());
        return Response.json(
          { error: "La receta generada no cumple el formato esperado. Prueba otra vez.", requestId },
          { status: 500 }
        );
      }
    }

    cacheSet(cacheKey, parsed.data);

    return Response.json({ recipe: parsed.data, requestId });
  } catch (err: any) {
    debugError("api_recipe_unhandled", { requestId, error: err });
    return Response.json(
      { error: "Error en /api/recipe", details: err?.message ?? String(err), requestId },
      { status: 500 }
    );
  }
}