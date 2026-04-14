"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/src/components/ui/Button";
import Modal from "@/src/components/ui/Modal";
import Chip from "@/src/components/ui/Chip";

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

  async function sendWithText(text: string) {
    if (!text || loading) return;

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const shortHistory = nextMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

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
        setMessages((prev) => [...prev, { role: "assistant", content: String(data?.text || "") }]);
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

    sessionStorage.setItem("lucca_last_prompt_v1", finalPrompt);

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

      sessionStorage.setItem("lucca_current_recipe_v1", JSON.stringify(data.recipe));
      window.location.href = "/pick";
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

    setPendingPrompt(text);
    setSelectedStyles([]);
    setServings(2);
    setStylesOpen(true);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Hoy Cocino</h1>

        <Button variant="secondary" onClick={() => setShowSettings(true)} style={{ padding: "8px 10px" }}>
          Ajustes
        </Button>
      </div>

      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        “Hoy cocino X”. Dime lo que tienes y te lo dejo fácil.
      </p>

      {/* Quick */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {quick.map((q) => (
          <Chip
            key={q.label}
            disabled={loading}
            onClick={() => {
              setPendingPrompt(q.text);
              setSelectedStyles([]);
              setServings(2);
              setStylesOpen(true);
            }}
            style={{ padding: "8px 10px" }} // un pelín más compacto que el chip normal
          >
            {q.label}
          </Chip>
        ))}
      </div>

      {/* Modal estilos */}
      <Modal open={stylesOpen} onClose={() => setStylesOpen(false)} title="¿Qué estilo te apetece?" maxWidth={520}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {STYLE_OPTIONS.map((s) => {
            const active = selectedStyles.includes(s);
            return (
              <Button
                key={s}
                variant={active ? "primary" : "secondary"}
                onClick={() => toggleStyle(s)}
                style={{
                  borderRadius: 999,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                {s}
              </Button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setStylesOpen(false)} style={{ flex: 1 }}>
            Cancelar
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setStylesOpen(false);
              setServingsOpen(true);
            }}
            style={{ flex: 1 }}
          >
            Seguir
          </Button>
        </div>
      </Modal>

      {/* Modal raciones */}
      <Modal
        open={servingsOpen}
        onClose={() => {
          setServingsOpen(false);
          setPendingPrompt(null);
        }}
        title="¿Para cuántas personas?"
        maxWidth={420}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Button
              key={n}
              variant={servings === n ? "primary" : "secondary"}
              onClick={() => setServings(n)}
              style={{
                flex: "1 0 28%",
                padding: "10px 12px",
              }}
            >
              {n}
            </Button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            onClick={() => {
              setServingsOpen(false);
              setPendingPrompt(null);
            }}
            style={{ flex: 1 }}
          >
            Cancelar
          </Button>

          <Button
            variant="primary"
            onClick={async () => {
              if (!pendingPrompt) return;
              setServingsOpen(false);
              const p = pendingPrompt;
              setPendingPrompt(null);
              await cookWithPrompt(p);
            }}
            style={{ flex: 1 }}
          >
            Cocinar
          </Button>
        </div>
      </Modal>

      {/* Chat */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div
              key={idx}
              style={{
                alignSelf: isUser ? "flex-end" : "flex-start",
                background: isUser ? "var(--fg)" : "var(--card)",
                color: isUser ? "var(--bg)" : "var(--fg)",
                border: isUser ? "none" : "var(--border)",
                padding: "10px 12px",
                borderRadius: "var(--r-lg)",
                maxWidth: "92%",
                whiteSpace: "pre-wrap",
                lineHeight: 1.35,
              }}
            >
              {m.content}
            </div>
          );
        })}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "var(--card)",
              border: "var(--border)",
              padding: "10px 12px",
              borderRadius: "var(--r-lg)",
              maxWidth: "92%",
              opacity: 0.8,
              color: "var(--fg)",
            }}
          >
            Pensando…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ✅ Modal ajustes (migrado a Modal) */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Ajustes" maxWidth={520}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Tipo de cocina</div>
          <select
            value={prefs.cuisine}
            onChange={(e) => setPrefs((p) => ({ ...p, cuisine: e.target.value }))}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              border: "var(--border)",
              background: "var(--card)",
              color: "var(--fg)",
            }}
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
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Equipo disponible</div>

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
              <span style={{ color: "var(--fg)" }}>{label}</span>
            </label>
          ))}

          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Se guarda automáticamente en este dispositivo (sin registro).
          </div>
        </div>

        {/* Extra UX móvil: botón grande para cerrar abajo */}
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={() => setShowSettings(false)} style={{ width: "100%" }}>
            Listo
          </Button>
        </div>
      </Modal>

      {/* Barra fija abajo */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--card)",
          borderTop: "var(--border)",
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
              border: "var(--border)",
              outline: "none",
              color: "var(--fg)",
              background: "var(--card)",
            }}
          />

          <Button variant="primary" onClick={send} disabled={loading} style={{ padding: "12px 14px" }}>
            {loading ? "…" : "Enviar"}
          </Button>
        </div>
      </div>
    </main>
  );
}