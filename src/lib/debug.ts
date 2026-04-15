export function debugError(label: string, err: unknown) {
  // Solo en desarrollo para no spamear producción
  if (process.env.NODE_ENV === "production") return;

  // eslint-disable-next-line no-console
  console.warn(`[Lucca][${label}]`, err);
}