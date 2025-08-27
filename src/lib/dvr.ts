import type { DVR, TimeResult, HDDInfo } from "../types";

function scheme(dvr: DVR) { return dvr.auth.https ? "https" : "http"; }
function hostOf(dvr: DVR) { return dvr.auth.ddns || dvr.auth.ip; }
function baseUrl(s: "http" | "https", h: string, p?: number) { return p ? `${s}://${h}:${p}` : `${s}://${h}`; }
export function dvrWebUrl(dvr: DVR) { return baseUrl(scheme(dvr), hostOf(dvr), dvr.auth.httpPort); }

export function snapshotUrl(dvr: DVR, channel: number) {
  const q = new URLSearchParams({
    vendor: dvr.vendor,
    scheme: scheme(dvr),
    host: hostOf(dvr),
    port: String(dvr.auth.httpPort || ""),
    user: dvr.auth.username,
    pass: dvr.auth.password,
    ch: String(channel),
  });
  return `/__dvr/snapshot?${q.toString()}`;
}

function parseIntelbrasTime(txt: string) {
  const m = txt.match(/(?:result|time|LocalTime)\s*=\s*([^\r\n]+)/i);
  return m ? m[1].trim() : txt.trim();
}

function parseIsapiTime(txt: string) {
  const iso = txt.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return iso ? iso[0] : txt.trim();
}

async function getText(url: string) {
  const r = await fetch(url);
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

export async function fetchDvrTime(dvr: DVR): Promise<TimeResult> {
  const q = new URLSearchParams({
    vendor: dvr.vendor,
    scheme: scheme(dvr),
    host: hostOf(dvr),
    port: String(dvr.auth.httpPort || ""),
    user: dvr.auth.username,
    pass: dvr.auth.password,
  });
  const url = `/__dvr/time?${q.toString()}`;
  console.log("[onTime][proxy] →", url);
  const r = await getText(url);
  console.log("[onTime][proxy] ←", { status: r.status, ok: r.ok, sample: r.text.slice(0, 200) });
  if (!r.ok) return { ok: false, raw: r.text };
  if (dvr.vendor === "intelbras") return { ok: true, value: parseIntelbrasTime(r.text), raw: r.text };
  return { ok: true, value: parseIsapiTime(r.text), raw: r.text };
}

export async function fetchHddInfo(dvr: DVR): Promise<HDDInfo> {
  const q = new URLSearchParams({
    vendor: dvr.vendor,
    scheme: scheme(dvr),
    host: hostOf(dvr),
    port: String(dvr.auth.httpPort || ""),
    user: dvr.auth.username,
    pass: dvr.auth.password,
  });
  const url = `/__dvr/hdd?${q.toString()}`;
  console.log("[hdd][proxy] →", url);
  const r = await getText(url);
  console.log("[hdd][proxy] ←", { status: r.status, ok: r.ok, sample: r.text.slice(0, 200) });
  if (!r.ok) return { ok: false, raw: r.text };
  if (dvr.vendor === "intelbras") {
    try {
      const data = JSON.parse(r.text);
      const list = Array.isArray(data?.devices) ? data.devices : data?.device ? [data.device] : [];
      const disks = list.map((d: any) => ({ name: d?.Name ?? d?.name, capacityBytes: d?.Capacity ?? d?.capacity, state: d?.State ?? d?.state }));
      const total = disks.reduce((a: number, b: any) => a + (Number(b.capacityBytes) || 0), 0) || undefined;
      return { ok: true, summary: { totalBytes: total, disks }, raw: data };
    } catch {
      return { ok: false, raw: r.text };
    }
  } else {
    const cap = r.text.match(/<capacity>(\d+)<\/capacity>/i);
    const free = r.text.match(/<freeSpace>(\d+)<\/freeSpace>/i);
    return { ok: true, summary: { totalBytes: cap ? Number(cap[1]) : undefined, freeBytes: free ? Number(free[1]) : undefined }, raw: r.text };
  }
}
