export async function apiJson<T = any>(
  input: RequestInfo,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; errorMsg: string | null; requestId: string | null }> {
  const res = await fetch(input, init);

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // respuesta no-JSON (o vacía)
    data = null;
  }

  const requestId = data?.requestId ? String(data.requestId) : null;

  if (!res.ok) {
    const base = data?.error ? String(data.error) : `Error HTTP ${res.status}`;
    const rid = requestId ? ` (ID: ${requestId})` : "";
    return { ok: false, status: res.status, data, errorMsg: base + rid, requestId };
  }

  return { ok: true, status: res.status, data, errorMsg: null, requestId };
}