"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

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

const DEFAULT_PREFS: Prefs = {
  cuisine: "Española",
  equipment: {
    airfryer: false,
    thermomix: false,
    horno: true,
    ollaExpress: false,
  },
};

export default function HomePage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Ey 👨‍🍳 Soy Lucca.Fuerte. Dime qué te apetece hoy (o qué tienes en la nevera) y te lo resuelvo en 20 min.",
    },
  ]);
  const quick = [
    { label: "Tengo esto…", text: "Tengo: ___. Quiero cena en 20 min. Dame 2 opciones y elige 1." },
    { label: "Pasta", text: "Quiero una receta de pasta viral en 20 min (4-6 ingredientes) con wow." },
    { label: "Pollo", text: "Quiero una cena rápida con pollo en 20 min (sin complicarme) con wow." },
    { label: "Ensalada", text: "Quiero una ensalada que llene (20 min) con proteína y wow." },
    { label: "Airfryer", text: "Quiero algo en airfryer en 20 min, crujiente y fácil." },
    { label: "Postre", text: "Quiero un postre rápido (máx 6 ingredientes) con wow." },
    { label: "Cena rápida", text: "Cena rápida 15-20 min, poco fregado, ingredientes de súper en España." },
    { label: "Para niños", text: "Cena para niños quisquillosos (20 min), rica y fácil." },
    { label: "Snack", text: "Snack salado rápido para picar, con wow." },
  ];
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [showSettings, setShowSettings] = useState(false);
  const [servingsOpen, setServingsOpen] = useState(false);
  const [fromChat, setFromChat] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [servings, setServings] = useState(2);
  const STYLE_OPTIONS = [
    "Saludable",
    "Comfort",
    "Alto en proteína",
    "Sin gluten",
    "Vegano",
    "Cena rápida",
    "Para niños",
    "Snack",
    "Bajo presupuesto",
  ];

  const [stylesOpen, setStylesOpen] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);

  function toggleStyle(s: string) {
    setSelectedStyles((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  // Cargar prefs al iniciar (solo en cliente)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs(JSON.parse(raw));
    } catch {}
  }, []);

  // Guardar prefs cuando cambien
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendText(text: string) {
    const cleaned = text.trim();
    if (!cleaned || loading) return;
    setInput(cleaned);
    // Espera un tick para que el estado se actualice, y envía
    setTimeout(() => {
      setInput("");
      // Llamamos a send con el texto sin depender del input
      sendWithText(cleaned);
    }, 0);
  }

  async function sendWithText(text: string) {
    if (!text || loading) return;

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const shortHistory = nextMessages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, shortHistory, prefs }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ Error: ${data?.error || "Algo falló"}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: String(data?.text || "") },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error de red: ${e?.message || e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function cookWithPrompt(prompt: string) {
  const text = prompt.trim();
  if (!text || loading) return;
  
  setMessages((prev) => [
    ...prev,
    { role: "user", content: prompt },
    { role: "assistant", content: "Perfecto. Dame 5 segundos y te lo dejo listo 👨‍🍳" },
  ]);

  setLoading(true);

  const styleLine = selectedStyles.length ? `ESTILO: ${selectedStyles.join(", ")}` : "";
  const finalPrompt = [prompt, styleLine, `RACIONES: ${servings}`].filter(Boolean).join("\n");

  try {
    const res = await fetch("/api/recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: finalPrompt, prefs }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error: ${data?.error || "No se pudo generar la receta"}` },
      ]);
      return;
    }

    // Guardamos la receta para que /cook la lea
    sessionStorage.setItem("lucca_current_recipe_v1", JSON.stringify(data.recipe));

    // Ir directo a modo cocina
    window.location.href = "/cook";
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error de red: ${e?.message || e}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");

    // Abrimos flujo estilo->raciones y luego cocinar con ese prompt
    setFromChat(true);
    setPendingPrompt(text);
    setSelectedStyles([]);
    setServings(2);
    setStylesOpen(true);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 96 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Hoy Cocino</h1>

        <button
          onClick={() => setShowSettings(true)}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Ajustes
        </button>
      </div>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        “Hoy cocino X”. Dime lo que tienes y te lo dejo fácil.
      </p>

      {/* Botones rápidos */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => {
              setPendingPrompt(q.text);
              setSelectedStyles([]);
              setServings(2);
              setStylesOpen(true);
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 13,
              opacity: loading ? 0.6 : 1,
            }}
            disabled={loading}
          >
            {q.label}
          </button>
        ))}
      </div>

      {stylesOpen && (
        <div
          onClick={() => setStylesOpen(false)}
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
            <div style={{ fontWeight: 900, marginBottom: 10 }}>¿Qué estilo te apetece?</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {STYLE_OPTIONS.map((s) => {
                const active = selectedStyles.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStyle(s)}
                    style={{
                      border: "1px solid #111",
                      padding: "10px 12px",
                      borderRadius: 999,
                      background: active ? "#111" : "#fff",
                      color: active ? "#fff" : "#111",
                      fontWeight: 900,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setStylesOpen(false)}
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
                  setStylesOpen(false);
                  setServingsOpen(true);
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
                Seguir
              </button>
            </div>
          </div>
        </div>
      )}

      {servingsOpen && (
        <div
          onClick={() => {
            setServingsOpen(false);
            setPendingPrompt(null);
          }}
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
              maxWidth: 420,
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #111",
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>
              ¿Para cuántas personas?
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setServings(n)}
                  style={{
                    flex: "1 0 28%",
                    border: "1px solid #111",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: servings === n ? "#111" : "#fff",
                    color: servings === n ? "#fff" : "#111",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setServingsOpen(false);
                  setPendingPrompt(null);
                }}
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
                onClick={async () => {
                  if (!pendingPrompt) return;
                  setServingsOpen(false);
                  const p = pendingPrompt;
                  setPendingPrompt(null);
                  setFromChat(false);
                  await cookWithPrompt(p);
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
                Cocinar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#111" : "#f2f2f2",
              color: m.role === "user" ? "#fff" : "#000",
              padding: "10px 12px",
              borderRadius: 14,
              maxWidth: "92%",
              whiteSpace: "pre-wrap",
              lineHeight: 1.35,
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "#f2f2f2",
              padding: "10px 12px",
              borderRadius: 14,
              maxWidth: "92%",
              opacity: 0.8,
            }}
          >
            Pensando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#111",
              borderRadius: 16,
              border: "1px solid #111",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Ajustes</div>
              <button
                onClick={() => setShowSettings(false)}
                style={{ fontWeight: 800, fontSize: 16, border: "1px solid #111", background: "#fff", padding: "6px 10px", borderRadius: 10, cursor: "pointer", color: "black" }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Tipo de cocina</div>
              <select
                value={prefs.cuisine}
                onChange={(e) => setPrefs((p) => ({ ...p, cuisine: e.target.value }))}
                style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #111" }}
              >
                <option>Española</option>
                <option>Italiana</option>
                <option>Mediterránea</option>
                <option>Latina</option>
                <option>Asiática</option>
                <option>Flexible</option>
              </select>
            </div>

            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Equipo disponible</div>

              {(
                [
                  ["airfryer", "Airfryer"],
                  ["thermomix", "Thermomix"],
                  ["horno", "Horno"],
                  ["ollaExpress", "Olla exprés"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <input
                    type="checkbox"
                    checked={prefs.equipment[key]}
                    onChange={(e) => setPrefs((p) => ({ ...p, equipment: { ...p.equipment, [key]: e.target.checked } }))}
                  />
                  <span>{label}</span>
                </label>
              ))}

              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                Se guarda automáticamente en este dispositivo (sin registro).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra fija abajo */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "white",
          borderTop: "1px solid #eee",
          padding: 12,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder='Ej: "Tengo pasta y atún" o "cena rápida para niños"'
            style={{
              flex: 1,
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid #111",
              outline: "none",
              color: "#111",
              background: "#fff",
            }}
          />
          <button
            onClick={send}
            disabled={loading}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: loading ? "#999" : "#111",
              color: "white",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </main>
  );
}
