"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/src/components/ui/Button";
import Card from "@/src/components/ui/Card";
import State from "@/src/components/ui/State";
import { track } from "@/src/lib/track";
import { debugError } from "@/src/lib/debug";
import { apiJson } from "@/src/lib/api";

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
const DIVERSITY_KEY = "lucca_pick_diversity_v1";

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

function fallbackMenuPitch(title: string) {
  const t = title.toLowerCase();

  if (t.includes("tortilla")) return "Jugosa por dentro, doradita por fuera. Sencilla y de las que apetecen.";
  if (t.includes("airfryer")) return "Crujiente sin fritanga. Rápido, limpio y con sabor.";
  if (t.includes("ensalada")) return "Fresquita, completa y con proteína. Nada de ensalada triste.";
  if (t.includes("pasta")) return "Cremosa y reconfortante. De las que se hacen y se repiten.";
  if (t.includes("pollo")) return "Jugoso y bien sazonado. Cena rápida sin complicarte.";
  if (t.includes("postre") || t.includes("bizcocho") || t.includes("yogur"))
    return "Dulce y ligero, con textura rica. Perfecto para quitar el antojo sin pasarte.";

  return "Sabroso, fácil y listo en 20 minutos. Sin complicarte.";
}

function promptRequiresFamily(prompt: string, family: string) {
  const p = (prompt || "").toLowerCase();

  const map: Record<string, string[]> = {
    pollo: ["pollo", "pechuga", "muslo", "contramuslo"],
    "pescado en lata / pescado": ["atún", "atun", "sardina", "caballa", "salmón", "salmon", "pescado"],
    "huevo/tortilla": ["huevo", "tortilla"],
    pasta: ["pasta", "espagueti", "penne", "macarron", "macarrón", "fideos"],
    arroz: ["arroz"],
    ensalada: ["ensalada"],
    postre: ["postre", "bizcocho", "yogur", "chocolate", "galleta", "tarta"],
    airfryer: ["airfryer"],
  };

  const keys = map[family] || [];
  return keys.some((k) => p.includes(k));
}

function guessFamilies(recipe: { title?: string; ingredients?: { item: string }[] }) {
  const t = (recipe.title || "").toLowerCase();
  const ing = (recipe.ingredients || []).map((x) => (x.item || "").toLowerCase()).join(" | ");

  const fam: string[] = [];

  if (ing.includes("pollo") || ing.includes("pechuga") || ing.includes("muslo")) fam.push("pollo");
  if (
    ing.includes("atún") ||
    ing.includes("atun") ||
    ing.includes("sardina") ||
    ing.includes("caballa") ||
    ing.includes("salmón") ||
    ing.includes("salmon") ||
    ing.includes("pescado")
  )
    fam.push("pescado en lata / pescado");
  if (ing.includes("huevo") || t.includes("tortilla")) fam.push("huevo/tortilla");

  if (ing.includes("pasta") || t.includes("pasta") || t.includes("espagueti") || t.includes("penne")) fam.push("pasta");
  if (ing.includes("arroz") || t.includes("arroz")) fam.push("arroz");
  if (t.includes("ensalada")) fam.push("ensalada");

  if (
    t.includes("postre") ||
    t.includes("bizcocho") ||
    ing.includes("yogur") ||
    ing.includes("chocolate") ||
    ing.includes("miel") ||
    ing.includes("azúcar") ||
    ing.includes("harina")
  )
    fam.push("postre");

  if (t.includes("airfryer")) fam.push("airfryer");
  if (
    t.includes("cruj") ||
    t.includes("empan") ||
    t.includes("nugget") ||
    t.includes("fingers") ||
    ing.includes("pan rallado") ||
    ing.includes("panko")
  )
    fam.push("crujiente/empanado");

  return fam;
}

function addToDiversity(recipe: { title?: string; ingredients?: { item: string }[] }) {
  try {
    const prev = JSON.parse(sessionStorage.getItem(DIVERSITY_KEY) || "[]") as string[];
    const next = Array.from(new Set([...prev, ...guessFamilies(recipe)])).slice(-14);
    sessionStorage.setItem(DIVERSITY_KEY, JSON.stringify(next));
  } catch (e) {
    // opcional: no rompe flujo
    debugError("pick_diversity_store", e);
  }
}

export default function PickPage() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const pickOpenTsRef = useRef<number | null>(null);
  const openTrackedRef = useRef(false);

  function t(name: string, meta?: Record<string, any>) {
    track({
      name,
      screen: "pick",
      recipeTitle: String(recipe?.title ?? ""),
      meta: meta || undefined,
    });
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs(JSON.parse(raw));
    } catch (e) {
      debugError("pick_prefs_load", e);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECIPE_KEY);
      if (raw) {
        const r = JSON.parse(raw);
        setRecipe(r);

        addToDiversity(r);

        sessionStorage.setItem("lucca_last_title_v1", String(r.title || ""));
        sessionStorage.setItem(
          "lucca_last_recipe_min_v1",
          JSON.stringify({ title: r.title || "", ingredients: r.ingredients || [] })
        );
      }
    } catch (e) {
      debugError("pick_recipe_load", e);
    }
  }, []);

  useEffect(() => {
    if (!recipe) return;
    if (openTrackedRef.current) return;

    openTrackedRef.current = true;
    pickOpenTsRef.current = Date.now();

    t("pick_open", { title: recipe.title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!recipe]);

  async function dislikeAndGetAnother() {
    setErr(null);

    const prompt = sessionStorage.getItem(PROMPT_KEY);
    if (!prompt) {
      setErr("No encuentro el prompt. Vuelve a Home y prueba otra vez.");
      return;
    }

    const elapsedMs = pickOpenTsRef.current ? Date.now() - pickOpenTsRef.current : null;
    t("pick_dislike", {
      elapsedMs,
      fromTitle: recipe?.title || "",
    });

    setLoading(true);
    try {
      const prevTitle = recipe?.title ?? "";
      const base = prompt || "";

      let bannedList: string[] = [];
      try {
        bannedList = JSON.parse(sessionStorage.getItem(DIVERSITY_KEY) || "[]") as string[];
      } catch (e) {
        debugError("pick_diversity_load", e);
        bannedList = [];
      }

      const originalPrompt = prompt || "";
      const filteredBanned = bannedList.filter((fam) => !promptRequiresFamily(originalPrompt, fam));
      const banned = filteredBanned.join(", ");

      const retryPrompt =
        `${base}\n\n` +
        `PROPUESTA ANTERIOR (NO REPETIR): "${prevTitle}".\n` +
        `REGLAS DE REGENERACIÓN (MUY IMPORTANTE):\n` +
        `1) Mantén TODAS las restricciones del mensaje original (categoría/tipo de plato, estilo(s), equipo/método como airfryer/thermomix/horno, tiempo, etc.).\n` +
        `2) Quiero una IDEA COMPLETAMENTE DISTINTA: NO vale renombrar el mismo plato ni cambiar 1 ingrediente.\n` +
        `3) Prohibido repetir la MISMA FAMILIA del plato anterior (ej: nuggets/fingers/empanado/crujiente = prohibido seguir empanando o haciendo fingers).\n` +
        `4) Si tu nueva idea rompe alguna restricción del original, descártala y genera otra antes de responder.\n` +
        `DIVERSIDAD (MUY IMPORTANTE):\n` +
        `- Evita repetir estas familias ya usadas (si NO están exigidas por el prompt): ${banned || "ninguna"}.\n` +
        `- Si el prompt NO pide una proteína específica, NO elijas pollo por defecto.\n` +
        `- Prioriza alternar BASES: (huevo/tortilla, legumbre, pasta, arroz, ensalada, pescado en lata) y alternar método.\n` +
        `Devuelve SOLO el JSON del esquema.\n`;

      // ✅ NUEVO: apiJson (maneja no-JSON + requestId + errorMsg consistente)
      const r = await apiJson<{ recipe?: Recipe; error?: string; requestId?: string }>("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: retryPrompt, prefs: prefs ?? undefined }),
      });

      if (!r.ok) {
        const errMsg = r.errorMsg || "No se pudo generar otra opción.";
        setErr(errMsg);
        debugError("pick_dislike_api", errMsg);

        t("pick_dislike_error", { error: errMsg });
        return;
      }

      const nextRecipe = r.data?.recipe;
      if (!nextRecipe) {
        const errMsg = "La API respondió sin receta.";
        setErr(errMsg);
        debugError("pick_dislike_no_recipe", r.data);

        t("pick_dislike_error", { error: "no_recipe" });
        return;
      }

      try {
        sessionStorage.setItem(RECIPE_KEY, JSON.stringify(nextRecipe));
      } catch (e) {
        debugError("pick_recipe_save", e);
      }

      setRecipe(nextRecipe);
      addToDiversity(nextRecipe);

      t("pick_dislike_success", { title: nextRecipe.title });
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      debugError("pick_dislike_fetch", e);

      t("pick_dislike_error", { error: msg });
    } finally {
      setLoading(false);
    }
  }

  if (!recipe) {
    return (
      <State
        title="Elige tu plato"
        message="No hay propuesta cargada aún. Vuelve a Home y genera una receta primero."
        actionLabel="Ir a Home"
        onAction={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Match de platos</div>
          <div style={{ fontSize: 14, fontWeight: 950, margin: "6px 0 2px" }}>Elige tu plato</div>
        </div>

        {/* ✅ NO CAMBIAR: Volver a Home */}
        <a
          href="/"
          style={{
            border: "var(--border)",
            padding: "8px 10px",
            borderRadius: "var(--r-md)",
            background: "var(--card)",
            color: "var(--fg)",
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Volver
        </a>
      </div>

      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 8 }}>Sugerencias del Chef:</div>

        <img
          src={svgCardDataUri(recipe.title)}
          alt={recipe.title}
          style={{
            width: "100%",
            height: 220,
            borderRadius: 14,
            objectFit: "cover",
            border: "var(--border)",
          }}
        />

        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 950, lineHeight: 1.15 }}>{recipe.title}</div>

        <div style={{ marginTop: 8, fontSize: 14, color: "var(--muted)", lineHeight: 1.35 }}>
          {recipe.menuPitch || fallbackMenuPitch(recipe.title)}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted-2)" }}>
          {recipe.timeMinutes} min · {recipe.servings} raciones
        </div>

        {err && (
          <div
            style={{
              marginTop: 12,
              border: "1px solid #c00",
              padding: 10,
              borderRadius: "var(--r-lg)",
              background: "var(--card)",
            }}
          >
            ⚠️ {err}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <Button
          variant="secondary"
          onClick={dislikeAndGetAnother}
          loading={loading}
          style={{ flex: 1, padding: "14px 12px" }}
        >
          No me gusta
        </Button>

        <Button
          variant="primary"
          onClick={() => {
            const elapsedMs = pickOpenTsRef.current ? Date.now() - pickOpenTsRef.current : null;

            t("pick_like", {
              elapsedMs,
              title: recipe.title,
            });

            window.location.href = "/prep";
          }}
          style={{ flex: 1, padding: "14px 12px" }}
        >
          Me gusta
        </Button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted-2)" }}>
        Consejo: si dudas, pulsa “No me gusta” 1 vez. La segunda opción suele clavarla.
      </div>
    </main>
  );
}