export const runtime = "nodejs";

type TrackEvent = {
  name: string; // ej: "pick_like", "cook_start", "cook_finish"
  screen?: string; // "home" | "pick" | "prep" | "cook" | ...
  ts?: number; // opcional (si no, lo ponemos nosotros)
  recipeTitle?: string; // opcional (MVP)
  meta?: Record<string, any>; // opcional
};

// “Tabla” en memoria (se reinicia al recargar el server; ok para dev)
declare global {
  // eslint-disable-next-line no-var
  var __lucca_events: TrackEvent[] | undefined;
}
const events: TrackEvent[] = globalThis.__lucca_events ?? [];
globalThis.__lucca_events = events;

function isObj(v: any): v is Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body?.name ?? "").trim();
    if (!name) return Response.json({ error: "name requerido" }, { status: 400 });

    const ev: TrackEvent = {
      name,
      screen: body?.screen ? String(body.screen).trim() : undefined,
      recipeTitle: body?.recipeTitle ? String(body.recipeTitle).trim() : undefined,
      ts: Date.now(),
      meta: isObj(body?.meta) ? body.meta : undefined,
    };

    events.push(ev);

    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json(
      { error: "Error en /api/track", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// (Opcional útil para debug) GET para ver los últimos eventos
export async function GET() {
  const last = events.slice(-50);
  return Response.json({ count: events.length, last });
}
