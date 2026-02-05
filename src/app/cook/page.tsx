"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CoachDock from "@/src/components/CoachDock";
import { RecipeV1Schema, type RecipeV1 } from "@/src/lib/recipe/schema";

const KEY = "lucca_current_recipe_v1";

function formatMMSS(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CookPage() {
  const [recipe, setRecipe] = useState<RecipeV1 | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  // Timer
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const tickRef = useRef<number | null>(null);

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);

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
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [running]);

  if (!recipe) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Modo Cocina</h1>
        <p style={{ opacity: 0.8, marginBottom: 12 }}>
          No hay receta cargada aún. Vuelve a Home y genera una receta primero.
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

  const total = recipe.steps.length;
  const hasTimer = (currentStep?.timerSec || 0) > 0;
  const showTimerUI = hasTimer && remaining > 0;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 170 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Modo Cocina</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "6px 0 2px" }}>{recipe.title}</h1>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {recipe.timeMinutes} min · {recipe.servings} raciones
          </div>
        </div>

        <a href="/" style={{ border: "1px solid #111", padding: "8px 10px", borderRadius: 12 }}>
          Salir
        </a>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #111", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>
            Paso {stepIdx + 1} / {total}
          </div>

          {showTimerUI && (
            <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18 }}>
              {formatMMSS(remaining)}
            </div>
          )}
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, whiteSpace: "pre-wrap" }}>
          {currentStep?.text}
        </div>

        {justFinished && (
          <div style={{ marginTop: 10, fontWeight: 900 }}>
            ⏰ Tiempo. Dale a “Avanzar”.
          </div>
        )}

        {showTimerUI && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                if (!running) unlockAudio();
                setJustFinished(false);
                setRunning((v) => !v);
              }}
              style={{
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {running ? "Pausar" : "Start"}
            </button>

            <button
              onClick={() => {
                setRunning(false);
                setRemaining(currentStep?.timerSec || 0);
                setJustFinished(false);
              }}
              style={{
                border: "1px solid #111",
                background: "#fff",
                color: "#111",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Reset
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => {
            setJustFinished(false);

            // Si estoy en el primer paso, volver significa volver a Preparación
            if (stepIdx === 0) {
              window.location.href = "/prep";
              return;
            }

            // Si no, retrocedo un paso normal
            setStepIdx((i) => Math.max(0, i - 1));
          }}
          disabled={!recipe || total <= 0}

          style={{
            flex: 1,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            padding: "12px 12px",
            borderRadius: 14,
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          Volver
        </button>

        <button
          onClick={() => {
            setJustFinished(false);
            setStepIdx((i) => Math.min(total - 1, i + 1));
          }}
          disabled={stepIdx >= total - 1}
          style={{
            flex: 1,
            border: "1px solid #111",
            background: stepIdx >= total - 1 ? "#ddd" : "#111",
            color: stepIdx >= total - 1 ? "#111" : "#fff",
            padding: "12px 12px",
            borderRadius: 14,
            cursor: stepIdx >= total - 1 ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          Avanzar
        </button>
      </div>

      {stepIdx === total - 1 && (
        <div style={{ marginTop: 14, border: "1px solid #111", borderRadius: 16, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Cierre rápido</div>

          <div style={{ marginBottom: 8 }}>
            <b>TRUCO:</b> {recipe.trick}
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>ERROR:</b> {recipe.errorCommon}
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>ARREGLO:</b> {recipe.fix}
          </div>

          <div style={{ fontWeight: 800, marginTop: 8, marginBottom: 6 }}>Emplatado</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.platingTips.slice(0, 3).map((t, idx) => (
              <li key={idx}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <CoachDock recipe={recipe} stepIndex={stepIdx} />
    </main>
  );
}
