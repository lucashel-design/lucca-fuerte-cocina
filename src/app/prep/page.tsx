"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RecipeV1Schema, type RecipeV1 } from "@/src/lib/recipe/schema";

type Prefs = {
  cuisine?: string;
  equipment?: {
    airfryer?: boolean;
    thermomix?: boolean;
    horno?: boolean;
    ollaExpress?: boolean;
  };
};

const RECIPE_KEY = "lucca_current_recipe_v1";
const PROMPT_KEY = "lucca_last_prompt_v1";
const PREFS_KEY = "lucca_prefs_v1";

export default function PrepPage() {
  const [recipe, setRecipe] = useState<RecipeV1 | null>(null);

  // modal “faltan”
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingMap, setMissingMap] = useState<Record<string, boolean>>({});
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenErr, setRegenErr] = useState<string | null>(null);
  const openTrackedRef = useRef(false);

  function track(name: string, meta?: Record<string, any>) {
    const payload = {
      name,
      screen: "prep",
      recipeTitle: String(recipe?.title ?? ""),
      meta: meta || undefined,
    };

    try {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        (navigator as any).sendBeacon("/api/track", blob);
        return;
      }
    } catch {}

    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // @ts-ignore
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }


  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECIPE_KEY);
      if (!raw) return;

      const json = JSON.parse(raw);
      const parsed = RecipeV1Schema.safeParse(json);

      if (!parsed.success) {
        console.warn("Receta inválida en sessionStorage", parsed.error.flatten());
        sessionStorage.removeItem(RECIPE_KEY);
        setRecipe(null);
        return;
      }

      setRecipe(parsed.data);
    } catch {
      // si hay JSON roto, limpiamos para no dejar la app en un estado raro
      sessionStorage.removeItem(RECIPE_KEY);
      setRecipe(null);
    }
  }, []);

  useEffect(() => {
    if (!recipe) return;
    if (openTrackedRef.current) return;

    openTrackedRef.current = true;
    track("prep_open", {
      ingredientCount: (recipe.ingredients || []).length,
      servings: recipe.servings,
      timeMinutes: recipe.timeMinutes,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!recipe]);

  const ingredientCount = useMemo(() => recipe?.ingredients?.length || 0, [recipe]);

  function openMissingModal() {
    if (!recipe) return;
    const initial: Record<string, boolean> = {};
    for (const ing of recipe.ingredients || []) initial[ing.item] = false;
    setMissingMap(initial);
    setRegenErr(null);

    track("prep_missing_open", { ingredientCount: (recipe.ingredients || []).length });

    setMissingOpen(true);
  }

  function compactRecipeForAdaptation(recipe: any) {
    return {
      title: recipe?.title ?? "",
      menuPitch: recipe?.menuPitch ?? "",
      timeMinutes: recipe?.timeMinutes ?? 20,
      servings: recipe?.servings ?? 1,
      // mandamos solo nombres (y pasos) para anclar sin inflar tokens
      ingredients: (recipe?.ingredients ?? []).map((i: any) => i?.item ?? "").filter(Boolean),
      steps: (recipe?.steps ?? []).map((s: any) => ({
        text: s?.text ?? "",
        timerSec: Number(s?.timerSec ?? 0),
      })),
    };
  }


  async function regenerateWithoutMissing() {
    if (!recipe) return;

    // 1) missing => string[] (esto es lo que la API necesita)
    const missingList = Object.entries(missingMap)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    if (missingList.length === 0) {
      setMissingOpen(false);
      return;
    }

    track("prep_adapt_missing_submit", {
      missingCount: missingList.length,
    });

    setRegenLoading(true);
    setRegenErr(null);

    try {
      // 2) Ancla: receta base compacta (barato en tokens)
      const baseRecipe = compactRecipeForAdaptation(recipe);

      // 3) Contexto opcional: prompt original (si lo tenías guardado)
      const basePrompt = sessionStorage.getItem(PROMPT_KEY) || "";

      // 4) Prefs (si existen)
      let prefs: Prefs | undefined = undefined;
      try {
        const rawPrefs = localStorage.getItem(PREFS_KEY);
        if (rawPrefs) prefs = JSON.parse(rawPrefs);
      } catch {}

      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "adapt_missing",
          baseRecipe,
          missing: missingList, // ✅ array de strings
          prefs,
          basePrompt,
        }),
      });

      const data = (await response.json()) as { recipe?: unknown; error?: string };

      if (!response.ok) {
        const errMsg = data?.error || "No se pudo adaptar la receta.";
        setRegenErr(errMsg);

        track("prep_adapt_missing_error", {
          missingCount: missingList.length,
          error: errMsg,
        });

        return;
      }

      // 5) Validación fuerte con Zod
      const parsed = RecipeV1Schema.safeParse(data?.recipe);

      if (!parsed.success) {
        console.warn("La API devolvió una receta inválida", parsed.error.flatten(), data);
        setRegenErr("La receta volvió con un formato raro. Dale otra vez o vuelve a Pick.");

        track("prep_adapt_missing_error", {
          missingCount: missingList.length,
          error: "schema_invalid",
        });

        return;
      }

      sessionStorage.setItem(RECIPE_KEY, JSON.stringify(parsed.data));
      setRecipe(parsed.data);
      setMissingOpen(false);

      track("prep_adapt_missing_success", {
        missingCount: missingList.length,
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      setRegenErr(msg);

      track("prep_adapt_missing_error", {
        missingCount: missingList.length,
        error: msg,
      });
    } finally {
      setRegenLoading(false);
    }
  }

  if (!recipe) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Preparación</h1>
        <p style={{ opacity: 0.8, marginBottom: 12 }}>
          No hay receta cargada. Vuelve a Home y genera una receta primero.
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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Preparación</div>
          <h1 style={{ fontSize: 22, fontWeight: 950, margin: "6px 0 2px" }}>{recipe.title}</h1>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {recipe.timeMinutes} min · {recipe.servings} raciones · {ingredientCount} ingredientes
          </div>
        </div>
        <a href="/pick" style={{ border: "1px solid #111", padding: "8px 10px", borderRadius: 12 }}>
          Salir
        </a>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #111", borderRadius: 16, padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Ingredientes</div>

        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(recipe.ingredients || []).map((ing, idx) => (
            <li key={idx}>
              <b>{ing.item}</b>
              {ing.amount ? <span style={{ opacity: 0.75 }}>{` — ${ing.amount}`}</span> : null}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            onClick={openMissingModal}
            style={{
              flex: 1,
              border: "1px solid #111",
              background: "#fff",
              color: "#111",
              padding: "12px 12px",
              borderRadius: 14,
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Me faltan ingredientes
          </button>

          <button
            onClick={() => {
              track("prep_start_cook", { stepIdx: 0 });
              window.location.href = "/cook";
            }}

            style={{
              flex: 1,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              padding: "12px 12px",
              borderRadius: 14,
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Empezar a cocinar
          </button>
        </div>

        {recipe.wow && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: "1px solid #111" }}>
            <div style={{ fontWeight: 950, marginBottom: 4 }}>WOW (opcional para impresionar)</div>
            <div style={{ lineHeight: 1.25 }}>{recipe.wow}</div>
          </div>
        )}
      </div>

      {missingOpen && (
        <div
          onClick={() => setMissingOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 90,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #111",
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Marca lo que te falta</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto" }}>
              {(recipe.ingredients || []).map((ing, idx) => (
                <label key={idx} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!missingMap[ing.item]}
                    onChange={() => setMissingMap((prev) => ({ ...prev, [ing.item]: !prev[ing.item] }))}
                  />
                  <span style={{ fontWeight: 700 }}>
                    {ing.item}{" "}
                    <span style={{ fontWeight: 400, opacity: 0.75 }}>{ing.amount ? `— ${ing.amount}` : ""}</span>
                  </span>
                </label>
              ))}
            </div>

            {regenErr && (
              <div style={{ marginTop: 10, border: "1px solid #c00", padding: 10, borderRadius: 12 }}>
                ⚠️ {regenErr}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setMissingOpen(false)}
                style={{
                  flex: 1,
                  border: "1px solid #111",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Cancelar
              </button>

              <button
                onClick={regenerateWithoutMissing}
                disabled={regenLoading}
                style={{
                  flex: 1,
                  border: "1px solid #111",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: regenLoading ? "#999" : "#111",
                  color: "#fff",
                  cursor: regenLoading ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                {regenLoading ? "Adaptando…" : "Adaptar receta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
