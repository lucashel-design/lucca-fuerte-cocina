"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CoachDock from "@/src/components/CoachDock";
import State from "@/src/components/ui/State";
import Card from "@/src/components/ui/Card";
import Button from "@/src/components/ui/Button";
import { RecipeV1Schema, type RecipeV1 } from "@/src/lib/recipe/schema";
import { track } from "@/src/lib/track";

const KEY = "lucca_current_recipe_v1";

function formatMMSS(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** ===== Stories helpers (1080x1920) ===== */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);

  let line = "";
  let lines = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    const w = ctx.measureText(testLine).width;

    if (w > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines++;
      line = words[n];

      if (lines >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }

  if (line && lines < maxLines) {
    let finalLine = line;
    while (ctx.measureText(finalLine).width > maxWidth && finalLine.length > 3) {
      finalLine = finalLine.slice(0, -2).trim() + "…";
    }
    ctx.fillText(finalLine, x, y);
  }
}

function downloadStoryCard(recipe: RecipeV1) {
  const W = 1080;
  const H = 1920;

  const title = String(recipe?.title ?? "").trim() || "Mi receta";
  const pitch = String(recipe?.menuPitch ?? "").trim();
  const trick = String(recipe?.trick ?? "").trim();
  const wow = String(recipe?.wow ?? "").trim();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no soportado");

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b0b0b");
  g.addColorStop(1, "#232323");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.42, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("Lucca.Fuerte Cocina", 70, 110);

  ctx.font = "900 72px system-ui, -apple-system, Segoe UI, Roboto";
  wrapText(ctx, title, 70, 230, W - 140, 86, 3);

  if (pitch) {
    ctx.globalAlpha = 0.9;
    ctx.font = "600 36px system-ui, -apple-system, Segoe UI, Roboto";
    wrapText(ctx, pitch, 70, 520, W - 140, 48, 4);
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 0.95;
  ctx.font = "900 34px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("TRUCO", 70, 980);
  ctx.font = "600 34px system-ui, -apple-system, Segoe UI, Roboto";
  wrapText(ctx, trick || "—", 70, 1040, W - 140, 46, 3);

  ctx.font = "900 34px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("WOW (opcional)", 70, 1220);
  ctx.font = "600 34px system-ui, -apple-system, Segoe UI, Roboto";
  wrapText(ctx, wow || "—", 70, 1280, W - 140, 46, 3);

  ctx.globalAlpha = 0.75;
  ctx.font = "800 30px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("© Lucca.Fuerte Cocina", 70, H - 90);
  ctx.font = "600 26px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("Comparte en Stories", 70, H - 50);
  ctx.globalAlpha = 1;

  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `lucca-story-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function CookPage() {
  const [recipe, setRecipe] = useState<RecipeV1 | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [finishTracked, setFinishTracked] = useState(false);

  // Timer
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const tickRef = useRef<number | null>(null);

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);

  function t(name: string, meta?: Record<string, any>) {
    track({
      name,
      screen: "cook",
      recipeTitle: String(recipe?.title ?? ""),
      meta: meta || undefined,
    });
  }

  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    } catch {}
  }

  function beep() {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === "suspended") ctx.resume();

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.06;

      o.connect(g);
      g.connect(ctx.destination);

      o.start();
      setTimeout(() => o.stop(), 250);
    } catch {}
  }

  const currentStep = useMemo(() => {
    if (!recipe) return null;
    return recipe.steps[Math.min(stepIdx, recipe.steps.length - 1)];
  }, [recipe, stepIdx]);

  // Load recipe
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;

      const json = JSON.parse(raw);
      const parsed = RecipeV1Schema.safeParse(json);

      if (!parsed.success) {
        console.warn("Receta inválida en sessionStorage (Cook)", parsed.error.flatten());
        sessionStorage.removeItem(KEY);
        setRecipe(null);
        return;
      }

      setRecipe(parsed.data);
    } catch {
      sessionStorage.removeItem(KEY);
      setRecipe(null);
    }
  }, []);

  useEffect(() => {
    if (!recipe) return;
    setFinishTracked(false);
  }, [recipe?.title]);

  useEffect(() => {
    if (!recipe) return;
    const totalSteps = recipe.steps.length;
    if (totalSteps <= 0) return;

    const isLast = stepIdx === totalSteps - 1;
    if (isLast && !finishTracked) {
      t("cook_finish", { total: totalSteps });
      setFinishTracked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, finishTracked, recipe?.title]);

  useEffect(() => {
    if (!recipe) return;
    t("cook_open", { stepIdx: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!recipe]);

  useEffect(() => {
    if (!recipe || !currentStep) return;

    t("cook_step_view", {
      stepIdx,
      total: recipe.steps.length,
      timerSec: currentStep.timerSec || 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, recipe?.title]);

  // Reset timer when step changes
  useEffect(() => {
    if (!currentStep) return;
    setRunning(false);
    setRemaining(currentStep.timerSec || 0);
    setJustFinished(false);
  }, [currentStep?.text]);

  // Tick loop
  useEffect(() => {
    if (!running) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }

    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);

          try {
            if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
          } catch {}

          beep();
          setJustFinished(true);

          t("timer_finish", {
            stepIdx,
            total: recipe?.steps?.length || 0,
            timerSec: currentStep?.timerSec || 0,
          });

          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  if (!recipe) {
    return (
      <State
        title="Modo Cocina"
        message="No hay receta cargada aún. Vuelve a Home y genera una receta primero."
        actionLabel="Ir a Home"
        onAction={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  const total = recipe.steps.length;
  const hasTimer = (currentStep?.timerSec || 0) > 0;
  const showTimerUI = hasTimer && remaining > 0;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 170 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Modo Cocina</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "6px 0 2px" }}>{recipe.title}</h1>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {recipe.timeMinutes} min · {recipe.servings} raciones
          </div>
        </div>

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
          Salir
        </a>
      </div>

      {/* ✅ Card principal del paso */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>
            Paso {stepIdx + 1} / {total}
          </div>

          {showTimerUI && (
            <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 18 }}>{formatMMSS(remaining)}</div>
          )}
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, whiteSpace: "pre-wrap" }}>
          {currentStep?.text}
        </div>

        {justFinished && <div style={{ marginTop: 10, fontWeight: 900 }}>⏰ Tiempo. Dale a “Avanzar”.</div>}

        {showTimerUI && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button
              variant="primary"
              onClick={() => {
                if (!running) unlockAudio();
                setJustFinished(false);

                t(running ? "timer_pause" : "timer_start", {
                  stepIdx,
                  total: recipe.steps.length,
                  remaining,
                  timerSec: currentStep?.timerSec || 0,
                });

                setRunning((v) => !v);
              }}
            >
              {running ? "Pausar" : "Start"}
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                t("timer_reset", {
                  stepIdx,
                  total: recipe.steps.length,
                  timerSec: currentStep?.timerSec || 0,
                });

                setRunning(false);
                setRemaining(currentStep?.timerSec || 0);
                setJustFinished(false);
              }}
            >
              Reset
            </Button>
          </div>
        )}
      </Card>

      {/* ✅ Navegación (sin botones extra) */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button
          variant="secondary"
          onClick={() => {
            setJustFinished(false);

            if (stepIdx === 0) {
              window.location.href = "/prep";
              return;
            }

            setStepIdx((i) => Math.max(0, i - 1));
          }}
          disabled={!recipe || total <= 0}
          style={{ flex: 1 }}
        >
          Volver
        </Button>

        <Button
          variant="primary"
          onClick={() => {
            setJustFinished(false);
            setStepIdx((i) => Math.min(total - 1, i + 1));
          }}
          disabled={stepIdx >= total - 1}
          style={{
            flex: 1,
            background: stepIdx >= total - 1 ? "#ddd" : "var(--fg)",
            color: stepIdx >= total - 1 ? "#111" : "var(--bg)",
          }}
        >
          Avanzar
        </Button>
      </div>

      {/* ✅ Cierre final */}
      {stepIdx === total - 1 && (
        <Card style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 6 }}>Cierre rápido</div>

          <div style={{ marginBottom: 8 }}>
            <b>TRUCO:</b> {recipe.trick}
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>ERROR:</b> {recipe.errorCommon}
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>ARREGLO:</b> {recipe.fix}
          </div>

          <div style={{ fontWeight: 900, marginTop: 8, marginBottom: 6 }}>Emplatado</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.platingTips.slice(0, 3).map((t, idx) => (
              <li key={idx}>{t}</li>
            ))}
          </ul>

          <Button
            variant="primary"
            onClick={() => {
              try {
                downloadStoryCard(recipe);
                t("story_download", { where: "cook_final", stepIdx, total });
              } catch (e: any) {
                console.warn("No se pudo generar la story", e);
                t("story_download_error", { msg: e?.message || String(e) });
              }
            }}
            style={{ marginTop: 12, width: "100%" }}
          >
            Descargar Story (1080×1920)
          </Button>
        </Card>
      )}

      <CoachDock recipe={recipe} stepIndex={stepIdx} />
    </main>
  );
}