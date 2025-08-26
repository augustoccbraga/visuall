export function baseUrl(scheme: "http" | "https", host: string, port?: number) {
  return port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`;
}

export function urlWithAuth(url: string, user: string, pass: string) {
  try {
    const u = new URL(url);
    u.username = user;
    u.password = pass;
    return u.toString();
  } catch {
    return url;
  }
}

export function basicAuthHeader(user: string, pass: string) {
  const token = btoa(`${user}:${pass}`);
  return { Authorization: `Basic ${token}` };
}

export async function getText(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function postJSON<T = unknown>(url: string, body: unknown, headers?: Record<string, string>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) }, body: JSON.stringify(body) });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data: data as T, raw: text };
}
