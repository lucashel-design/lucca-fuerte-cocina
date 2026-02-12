"use client";

import { useMemo, useRef, useState } from "react";

type CoachDockProps = {
  recipe?: any; // receta actual (la compactamos para ahorrar tokens)
  stepIndex?: number; // índice del paso actual en Cook
};

type Msg = { role: "user" | "assistant"; text: string };

export default function CoachDock({ recipe, stepIndex }: CoachDockProps) {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Estoy aquí. Pregúntame mientras cocinas (dudas, arreglos, ajustes…)."} ,
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  // Compactamos para controlar coste y no mandar un JSON enorme
  const compactRecipe = useMemo(() => {
    if (!recipe) return null;

    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((i: any) => i?.item ?? "").filter(Boolean)
      : [];

    const steps = Array.isArray(recipe.steps)
      ? recipe.steps
          .map((s: any) => String(s?.text ?? ""))
          .filter(Boolean)
          .slice(0, 12)
      : [];

    const currentStep =
      typeof stepIndex === "number" &&
      stepIndex >= 0 &&
      Array.isArray(recipe.steps) &&
      recipe.steps[stepIndex]
        ? String(recipe.steps[stepIndex]?.text ?? "")
        : "";

    return {
      title: String(recipe.title ?? ""),
      timeMinutes: Number(recipe.timeMinutes ?? 20),
      servings: Number(recipe.servings ?? 1),
      ingredients,
      steps,
      currentStep: currentStep || undefined,
    };
  }, [recipe, stepIndex]);

  function track(name: string, meta?: Record<string, any>) {
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          screen: "cook",
          recipeTitle: String(recipe?.title ?? ""),
          meta: meta || undefined,
        }),
      }).catch(() => {});
    } catch {}
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMsgs((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    // ✅ Evento: usuario envía mensaje al coach
    track("coach_send", {
      stepIdx: typeof stepIndex === "number" ? stepIndex : null,
      textLen: text.length,
    });

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screen: "cook",
          message: text,
          recipe: compactRecipe,
          stepIndex: typeof stepIndex === "number" ? stepIndex : undefined,
        }),
      });

      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        const errMsg = data?.error || "No he podido responder. Prueba otra vez.";
        setMsgs((prev) => [...prev, { role: "assistant", text: `⚠️ ${errMsg}` }]);

        // ✅ Evento: respuesta error
        track("coach_response", {
          ok: false,
          stepIdx: typeof stepIndex === "number" ? stepIndex : null,
          error: errMsg,
        });
      } else {
        const answer = String(data?.message || "").trim();
        setMsgs((prev) => [...prev, { role: "assistant", text: answer || "Vale." }]);

        // ✅ Evento: respuesta ok
        track("coach_response", {
          ok: true,
          stepIdx: typeof stepIndex === "number" ? stepIndex : null,
          answerLen: answer.length,
        });
      }
    } catch (e: any) {
      const err = e?.message || String(e);
      setMsgs((prev) => [...prev, { role: "assistant", text: `⚠️ ${err}` }]);

      // ✅ Evento: excepción/red
      track("coach_response", {
        ok: false,
        stepIdx: typeof stepIndex === "number" ? stepIndex : null,
        error: err,
      });
    } finally {
      setLoading(false);
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      }, 0);
    }
  }

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 80, padding: 12 }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          border: "1px solid #111",
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            borderBottom: open ? "1px solid #111" : "none",
          }}
        >
          <div style={{ fontWeight: 950, fontSize: 13 }}>
            Coach Cook{loading ? <span style={{ opacity: 0.6, fontWeight: 700 }}> · pensando…</span> : null}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              border: "1px solid #111",
              background: "#fff",
              borderRadius: 10,
              padding: "6px 10px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {open ? "Ocultar" : "Abrir"}
          </button>
        </div>

        {open ? (
          <>
            <div
              ref={listRef}
              style={{
                maxHeight: 180,
                overflow: "auto",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {msgs.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "90%",
                    border: "1px solid #111",
                    borderRadius: 12,
                    padding: "8px 10px",
                    background: m.role === "user" ? "#111" : "#fff",
                    color: m.role === "user" ? "#fff" : "#111",
                    fontSize: 13,
                    lineHeight: 1.25,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #111" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder='Ej: "Se me está secando, ¿cómo lo arreglo?"'
                style={{
                  flex: 1,
                  border: "1px solid #111",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 14,
                }}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                style={{
                  border: "1px solid #111",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontWeight: 950,
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  background: "#111",
                  color: "#fff",
                  opacity: loading || !input.trim() ? 0.6 : 1,
                }}
              >
                Enviar
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
