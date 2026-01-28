"use client";

import { useEffect, useState } from "react";

type Recipe = {
  title: string;
  menuPitch?: string;
  timeMinutes: number;
  servings: number;
  ingredients: { item: string; amount: string }[];
  substitutes: { for: string; instead: string }[];
  steps: { text: string; timerSec: number }[];
  trick: string;
  errorCommon: string;
  fix: string;
  wow: string;
  platingTips: string[];
  zeyraOptional: null | { title: string; text: string; url: string };
};


type Prefs = {
  cuisine: string;
  equipment: {
    airfryer: boolean;
    thermomix: boolean;
    horno: boolean;
    ollaExpress: boolean;
  };
};

const PREFS_KEY = "lucca_prefs_v1";
const RECIPE_KEY = "lucca_current_recipe_v1";
const PROMPT_KEY = "lucca_last_prompt_v1";

function svgCardDataUri(title: string) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 60);

  const t = esc(title);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#111"/>
        <stop offset="1" stop-color="#444"/>
      </linearGradient>
      <radialGradient id="p" cx="50%" cy="45%" r="55%">
        <stop offset="0" stop-color="#fff" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#ddd" stop-opacity="0.15"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="675" fill="url(#g)"/>
    <circle cx="600" cy="320" r="250" fill="url(#p)" />
    <circle cx="600" cy="320" r="210" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="10"/>
    <text x="60" y="610" fill="#fff" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-size="54" font-weight="800">
      ${t}
    </text>
  </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function PickPage() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

    useEffect(() => {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) setPrefs(JSON.parse(raw));
    } catch {}
    }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECIPE_KEY);
      if (raw) {
        const r = JSON.parse(raw);
        setRecipe(r);

        sessionStorage.setItem("lucca_last_title_v1", String(r.title || ""));
        sessionStorage.setItem(
          "lucca_last_recipe_min_v1",
          JSON.stringify({ title: r.title || "", ingredients: r.ingredients || [] })
        );
      }
    } catch {}
  }, []);


  async function dislikeAndGetAnother() {
    setErr(null);

    const prompt = sessionStorage.getItem(PROMPT_KEY);
    if (!prompt) {
      setErr("No encuentro el prompt. Vuelve a Home y prueba otra vez.");
      return;
    }

    setLoading(true);
    try {
        const prevTitle = recipe?.title ?? "";
        const base = prompt || "";

        const retryPrompt =
        `${base}\n\n` +
        `PROPUESTA ANTERIOR (NO REPETIR): "${prevTitle}".\n` +
        `REGLAS DE REGENERACIÓN (MUY IMPORTANTE):\n` +
        `1) Mantén TODAS las restricciones del mensaje original (categoría/tipo de plato, estilo(s), equipo/método como airfryer/thermomix/horno, tiempo, etc.).\n` +
        `2) Quiero una IDEA COMPLETAMENTE DISTINTA: NO vale renombrar el mismo plato ni cambiar 1 ingrediente.\n` +
        `3) Prohibido repetir la MISMA FAMILIA del plato anterior (ej: nuggets/fingers/empanado/crujiente = prohibido seguir empanando o haciendo fingers).\n` +
        `4) Si tu nueva idea rompe alguna restricción del original, descártala y genera otra antes de responder.\n` +
        `Devuelve SOLO el JSON del esquema.\n`;

      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: retryPrompt, prefs: prefs ?? undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErr(data?.error || "No se pudo generar otra opción.");
        return;
      }

      sessionStorage.setItem(RECIPE_KEY, JSON.stringify(data.recipe));
      setRecipe(data.recipe);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!recipe) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Elige tu plato</h1>
        <p style={{ opacity: 0.8, marginBottom: 12 }}>
          No hay propuesta cargada aún. Vuelve a Home y genera una receta primero.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            border: "1px solid #111",
            padding: "10px 12px",
            borderRadius: 12,
            fontWeight: 800,
          }}
        >
          Ir a Home
        </a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Match de platos</div>
          <div style={{ fontSize: 14, fontWeight: 950, margin: "6px 0 2px" }}>Elige tu plato</div>
        </div>

        <a href="/" style={{ border: "1px solid #111", padding: "8px 10px", borderRadius: 12 }}>
          Volver
        </a>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #111", borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Sugerencias del Chef:</div>

        <img
          src={svgCardDataUri(recipe.title)}
          alt={recipe.title}
          style={{
            width: "100%",
            height: 220,
            borderRadius: 14,
            objectFit: "cover",
            border: "1px solid #111",
          }}
        />

        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 950, lineHeight: 1.15 }}>
          {recipe.title}
        </div>

        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.85, lineHeight: 1.35 }}>
          {recipe.menuPitch || "Fácil, rico y listo en 20 minutos. Sin complicarte."}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          {recipe.timeMinutes} min · {recipe.servings} raciones
        </div>

        {err && (
          <div style={{ marginTop: 12, border: "1px solid #c00", padding: 10, borderRadius: 12 }}>
            ⚠️ {err}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          onClick={dislikeAndGetAnother}
          disabled={loading}
          style={{
            flex: 1,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            padding: "14px 12px",
            borderRadius: 14,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 950,
          }}
        >
          {loading ? "Buscando otra…" : "No me gusta"}
        </button>

        <button
          onClick={() => {
            window.location.href = "/prep";
          }}
          style={{
            flex: 1,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            padding: "14px 12px",
            borderRadius: 14,
            cursor: "pointer",
            fontWeight: 950,
          }}
        >
          Me gusta
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Consejo: si dudas, pulsa “No me gusta” 1 vez. La segunda opción suele clavarla.
      </div>
    </main>
  );
}
