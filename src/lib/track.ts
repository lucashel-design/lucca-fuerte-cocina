export type TrackPayload = {
  name: string;
  screen?: string;
  recipeTitle?: string;
  meta?: Record<string, any>;
};

export function track(payload: TrackPayload) {
  try {
    const body = JSON.stringify(payload);

    // Preferido (móvil): no bloquea navegación
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
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