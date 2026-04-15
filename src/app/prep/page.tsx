"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import State from "@/src/components/ui/State";
import Card from "@/src/components/ui/Card";
import Button from "@/src/components/ui/Button";
import { RecipeV1Schema, type RecipeV1 } from "@/src/lib/recipe/schema";
import { track } from "@/src/lib/track";

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

  function t(name: string, meta?: Record<string, any>) {
  track({
    name,
    screen: "prep",
    recipeTitle: String(recipe?.title ?? ""),
    meta: meta || undefined,
  });
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
      sessionStorage.removeItem(RECIPE_KEY);
      setRecipe(null);
    }
  }, []);

  useEffect(() => {
    if (!recipe) return;
    if (openTrackedRef.current) return;

    openTrackedRef.current = true;
    t("prep_open", {
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

    t("prep_missing_open", { ingredientCount: (recipe.ingredients || []).length });

    setMissingOpen(true);
  }

  function compactRecipeForAdaptation(recipe: any) {
    return {
      title: recipe?.title ?? "",
      menuPitch: recipe?.menuPitch ?? "",
      timeMinutes: recipe?.timeMinutes ?? 20,
      servings: recipe?.servings ?? 1,
      ingredients: (recipe?.ingredients ?? []).map((i: any) => i?.item ?? "").filter(Boolean),
      steps: (recipe?.steps ?? []).map((s: any) => ({
        text: s?.text ?? "",
        timerSec: Number(s?.timerSec ?? 0),
      })),
    };
  }

  async function regenerateWithoutMissing() {
    if (!recipe) return;

    const missingList = Object.entries(missingMap)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    if (missingList.length === 0) {
      setMissingOpen(false);
      return;
    }

    t("prep_adapt_missing_submit", { missingCount: missingList.length });

    setRegenLoading(true);
    setRegenErr(null);

    try {
      const baseRecipe = compactRecipeForAdaptation(recipe);
      const basePrompt = sessionStorage.getItem(PROMPT_KEY) || "";

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
          missing: missingList,
          prefs,
          basePrompt,
        }),
      });

      const data = (await response.json()) as { recipe?: unknown; error?: string };

      if (!response.ok) {
        const errMsg = data?.error || "No se pudo adaptar la receta.";
        setRegenErr(errMsg);

        t("prep_adapt_missing_error", { missingCount: missingList.length, error: errMsg });
        return;
      }

      const parsed = RecipeV1Schema.safeParse(data?.recipe);

      if (!parsed.success) {
        console.warn("La API devolvió una receta inválida", parsed.error.flatten(), data);
        setRegenErr("La receta volvió con un formato raro. Dale otra vez o vuelve a Pick.");

        t("prep_adapt_missing_error", { missingCount: missingList.length, error: "schema_invalid" });
        return;
      }

      sessionStorage.setItem(RECIPE_KEY, JSON.stringify(parsed.data));
      setRecipe(parsed.data);
      setMissingOpen(false);

      t("prep_adapt_missing_success", { missingCount: missingList.length });
    } catch (e: any) {
      const msg = e?.message || String(e);
      setRegenErr(msg);

      t("prep_adapt_missing_error", { missingCount: missingList.length, error: msg });
    } finally {
      setRegenLoading(false);
    }
  }

  if (!recipe) {
    return (
      <State
        title="Preparación"
        message="No hay receta cargada. Vuelve a Home y genera una receta primero."
        actionLabel="Ir a Home"
        onAction={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Preparación</div>
          <h1 style={{ fontSize: 22, fontWeight: 950, margin: "6px 0 2px" }}>{recipe.title}</h1>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {recipe.timeMinutes} min · {recipe.servings} raciones · {ingredientCount} ingredientes
          </div>
        </div>

        <a
          href="/pick"
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
          Salir
        </a>
      </div>

      {/* ✅ Card consistente */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Ingredientes</div>

        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(recipe.ingredients || []).map((ing, idx) => (
            <li key={idx}>
              <b>{ing.item}</b>
              {ing.amount ? <span style={{ color: "var(--muted)" }}>{` — ${ing.amount}`}</span> : null}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={openMissingModal} style={{ flex: 1 }}>
            Me faltan ingredientes
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              t("prep_start_cook", { stepIdx: 0 });
              window.location.href = "/cook";
            }}
            style={{ flex: 1 }}
          >
            Empezar a cocinar
          </Button>
        </div>

        {recipe.wow && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: "var(--r-lg)",
              border: "var(--border)",
              background: "var(--card)",
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 4 }}>WOW (opcional para impresionar)</div>
            <div style={{ lineHeight: 1.25, color: "var(--muted)" }}>{recipe.wow}</div>
          </div>
        )}
      </Card>

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
              background: "var(--card)",
              color: "var(--fg)",
              borderRadius: "var(--r-xl)",
              border: "var(--border)",
              padding: 16,
              boxShadow: "var(--shadow)",
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Marca lo que te falta</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto" }}>
              {(recipe.ingredients || []).map((ing, idx) => (
                <label key={idx} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!missingMap[ing.item]}
                    onChange={() => setMissingMap((prev) => ({ ...prev, [ing.item]: !prev[ing.item] }))}
                  />
                  <span style={{ fontWeight: 800 }}>
                    {ing.item}{" "}
                    <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                      {ing.amount ? `— ${ing.amount}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {regenErr && (
              <div style={{ marginTop: 10, border: "1px solid #c00", padding: 10, borderRadius: "var(--r-lg)" }}>
                ⚠️ {regenErr}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setMissingOpen(false)} style={{ flex: 1 }}>
                Cancelar
              </Button>

              <Button
                variant="primary"
                onClick={regenerateWithoutMissing}
                disabled={regenLoading}
                loading={regenLoading}
                style={{ flex: 1 }}
              >
                Adaptar receta
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}