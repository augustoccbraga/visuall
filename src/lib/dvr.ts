import type { DVR, TimeResult, HDDInfo } from "../types";
import { baseUrl, basicAuthHeader, getText, postJSON, urlWithAuth } from "./http";

function scheme(dvr: DVR) { return dvr.auth.https ? "https" : "http"; }
function host(dvr: DVR) { return dvr.auth.ddns || dvr.auth.ip; }
export function dvrWebUrl(dvr: DVR) { return baseUrl(scheme(dvr), host(dvr), dvr.auth.httpPort); }

export function snapshotUrl(dvr: DVR, channel: number) {
  const base = dvrWebUrl(dvr);
  if (dvr.vendor === "intelbras") return urlWithAuth(`${base}/cgi-bin/snapshot.cgi?channel=${channel}`, dvr.auth.username, dvr.auth.password);
  const id = channel * 100 + 1;
  return urlWithAuth(`${base}/ISAPI/Streaming/channels/${id}/picture`, dvr.auth.username, dvr.auth.password);
}

export async function fetchDvrTime(dvr: DVR): Promise<TimeResult> {
  const headers = basicAuthHeader(dvr.auth.username, dvr.auth.password);
  const base = dvrWebUrl(dvr);

  if (dvr.vendor === "intelbras") {
    const url = `${base}/cgi-bin/magicBox.cgi?action=getLocalTime`;
    console.log("[onTime] request", { vendor: dvr.vendor, url });
    const r = await getText(url, headers);
    console.log("[onTime] response", { vendor: dvr.vendor, status: r.status, ok: r.ok, body: r.text.slice(0, 200) });
    if (!r.ok) return { ok: false, raw: r.text };
    const m = r.text.match(/time=([^\r\n]+)/i) || r.text.match(/LocalTime=([^\r\n]+)/i);
    return { ok: true, value: m ? m[1].trim() : r.text.trim(), raw: r.text };
  }

  const url = `${base}/ISAPI/System/time/localTime`;
  console.log("[onTime] request", { vendor: dvr.vendor, url });
  const r = await getText(url, headers);
  console.log("[onTime] response", { vendor: dvr.vendor, status: r.status, ok: r.ok, body: r.text.slice(0, 200) });
  if (!r.ok) return { ok: false, raw: r.text };
  const iso = r.text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return { ok: true, value: iso ? iso[0] : r.text.trim(), raw: r.text };
}

export async function fetchHddInfo(dvr: DVR): Promise<HDDInfo> {
  const headers = basicAuthHeader(dvr.auth.username, dvr.auth.password);
  const base = dvrWebUrl(dvr);
  if (dvr.vendor === "intelbras") {
    const r = await postJSON<any>(`${base}/cgi-bin/api/StorageDeviceManager/getDeviceInfos`, { volume: "PhysicalVolume" }, headers);
    if (!r.ok) return { ok: false, raw: r.raw };
    const list = Array.isArray(r.data?.devices) ? r.data.devices : r.data?.device ? [r.data.device] : [];
    const disks = list.map((d: any) => ({ name: d?.Name ?? d?.name, capacityBytes: d?.Capacity ?? d?.capacity, state: d?.State ?? d?.state }));
    const total = disks.reduce((a: any, b: any) => a + (Number(b.capacityBytes) || 0), 0) || undefined;
    return { ok: true, summary: { totalBytes: total, disks }, raw: r.data };
  }
  const t = await getText(`${base}/ISAPI/ContentMgmt/Storage/hardDiskInfo`, headers);
  if (!t.ok) return { ok: false, raw: t.text };
  const cap = t.text.match(/<capacity>(\d+)<\/capacity>/i);
  const free = t.text.match(/<freeSpace>(\d+)<\/freeSpace>/i);
  return { ok: true, summary: { totalBytes: cap ? Number(cap[1]) : undefined, freeBytes: free ? Number(free[1]) : undefined }, raw: t.text };
}
