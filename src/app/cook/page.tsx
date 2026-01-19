"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Recipe = {
  title: string;
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

const KEY = "lucca_current_recipe_v1";

function formatMMSS(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CookPage() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [prepDone, setPrepDone] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingText, setMissingText] = useState("");
  const [missingList, setMissingList] = useState<string[]>([]);


  // Timer
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

    function unlockAudio() {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
        }

        // En algunos móviles queda “suspended” hasta un gesto
        if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
        }
    } catch {}
    }

    function beep() {
    try {
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        if (ctx.state === "suspended") {
        ctx.resume();
        }

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

  // Load recipe from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setRecipe(JSON.parse(raw));
    } catch {}
  }, []);

  // Whenever step changes, reset timer to step timerSec
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

          // Feedback de “terminó”
          try {
            if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
          } catch {}

          beep();

            setJustFinished(true);
            // 👇 Ya NO lo apagamos solo. Se quita al cambiar de paso o al Reset.
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
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Modo Cocina
        </h1>
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
          }}
        >
          Ir a Home
        </a>
      </main>
    );
  }

  if (!prepDone) {
    return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Preparación</div>
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
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Saca esto (rápido)</div>

            <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.ingredients.map((ing, idx) => (
                <li key={idx}>
                {ing.item}
                {ing.amount ? ` — ${ing.amount}` : ""}
                </li>
            ))}
            </ul>

            <div style={{ fontWeight: 900, marginTop: 14, marginBottom: 8 }}>Sustitutos baratos</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.substitutes.slice(0, 3).map((s, idx) => (
                <li key={idx}>
                Si no hay <b>{s.for}</b> → {s.instead}
                </li>
            ))}
            </ul>

            {missingList.length > 0 && (
                <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Te falta:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {missingList.map((m) => (
                        <span
                        key={m}
                        style={{
                            border: "1px solid #111",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontWeight: 700,
                            fontSize: 13,
                        }}
                        >
                        {m}
                        </span>
                    ))}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                    (Luego lo usamos para proponerte sustitutos y ajustar la receta.)
                    </div>
                </div>
                )}

            <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8 }}>
            Cuando estés listo, te voy guiando paso a paso.
            </div>
        </div>

        <button
        onClick={() => setMissingOpen(true)}
        style={{
            marginTop: 12,
            width: "100%",
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            padding: "12px 12px",
            borderRadius: 14,
            cursor: "pointer",
            fontWeight: 900,
        }}
        >
        Me falta un ingrediente
        </button>

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
                zIndex: 60,
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
                <div style={{ fontWeight: 900, marginBottom: 10 }}>¿Qué te falta?</div>

                <input
                    value={missingText}
                    onChange={(e) => setMissingText(e.target.value)}
                    placeholder="Ej: limón / ajo / tomate…"
                    style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #111",
                    marginBottom: 10,
                    }}
                />

                <div style={{ display: "flex", gap: 8 }}>
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
                    onClick={() => {
                        const m = missingText.trim();
                        if (!m) return;
                        setMissingList((prev) => (prev.includes(m) ? prev : [...prev, m]));
                        setMissingText("");
                        setMissingOpen(false);
                    }}
                    style={{
                        flex: 1,
                        border: "1px solid #111",
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "#111",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                    }}
                    >
                    Añadir
                    </button>
                </div>
                </div>
            </div>
            )}

        <button
            onClick={() => {
            setPrepDone(true);
            setStepIdx(0);
            }}
            style={{
            marginTop: 12,
            width: "100%",
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            padding: "14px 12px",
            borderRadius: 16,
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 16,
            }}
        >
            Empezar
        </button>
        </main>
    );
    }


  const total = recipe.steps.length;
  const hasTimer = (currentStep?.timerSec || 0) > 0;
  const showTimerUI = hasTimer && remaining > 0;

  return (
    <main
      style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 24 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Modo Cocina</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "6px 0 2px" }}>
            {recipe.title}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {recipe.timeMinutes} min · {recipe.servings} raciones
          </div>
        </div>

        <a
          href="/"
          style={{
            border: "1px solid #111",
            padding: "8px 10px",
            borderRadius: 12,
          }}
        >
          Salir
        </a>
      </div>

      <div
        style={{
          marginTop: 14,
          border: "1px solid #111",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 800 }}>
            Paso {stepIdx + 1} / {total}
          </div>

          {showTimerUI && (
            <div
              style={{
                fontFamily: "monospace",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              {formatMMSS(remaining)}
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.25,
            whiteSpace: "pre-wrap",
          }}
        >
          {currentStep?.text}
        </div>

        {/* ✅ AVISO EN PANTALLA CUANDO TERMINA EL TIMER */}
        {justFinished && (
          <div style={{ marginTop: 10, fontWeight: 800 }}>
            ⏰ Tiempo. Dale a “Siguiente”.
          </div>
        )}

        {showTimerUI && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                // gesto del usuario = desbloquea audio
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
          onClick={() => {setJustFinished(false); setStepIdx((i) => Math.max(0, i - 1))}}
          disabled={stepIdx === 0}
          style={{
            flex: 1,
            border: "1px solid #111",
            background: stepIdx === 0 ? "#ddd" : "#fff",
            color: "#111",
            padding: "12px 12px",
            borderRadius: 14,
            cursor: stepIdx === 0 ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          Anterior
        </button>

        <button
          onClick={() => {setJustFinished(false); setStepIdx((i) => Math.min(total - 1, i + 1))}}
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
          Siguiente
        </button>
      </div>

      {stepIdx === total - 1 && (
        <div
          style={{
            marginTop: 14,
            border: "1px solid #111",
            borderRadius: 16,
            padding: 14,
          }}
        >
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
          <div style={{ marginBottom: 8 }}>
            <b>WOW:</b> {recipe.wow}
          </div>

          <div style={{ fontWeight: 800, marginTop: 8, marginBottom: 6 }}>
            Emplatado
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.platingTips.slice(0, 3).map((t, idx) => (
              <li key={idx}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}