export async function proxyIntelbrasChannels(p: { baseUrl: string; username: string; password: string; prefer?: string[] }) {
  const r = await fetch("/api/intelbras/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p)
  });
  return r.json();
}

export async function proxyFetch(p: { baseUrl: string; path: string; method?: string; query?: Record<string, string | number>; username?: string; password?: string; headers?: Record<string, string>; body?: any }) {
  const r = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p)
  });
  return r.json();
}
