import DigestFetch from "digest-fetch";
import { XMLParser } from "fast-xml-parser";

const DBG = process.env.DEBUG_HIK === "1";
function dbg(...a) { if (DBG) console.log("[hikvision]", ...a); }
function arr(x) { return Array.isArray(x) ? x : x == null ? [] : [x]; }

async function req(client, url, mode) {
  const t0 = Date.now();
  dbg("GET", url);
  const r = await client.fetch(url);
  const ms = Date.now() - t0;
  const ct = r.headers.get("content-type") || "";
  dbg("RES", url, r.status, r.statusText, ms + "ms", ct);
  const text = await r.text();
  dbg("BODY", url, text.slice(0, 300));
  if (mode === "json" && ct.includes("json")) {
    try { return { ok: r.ok, json: JSON.parse(text), text }; } catch { return { ok: r.ok, json: null, text }; }
  }
  return { ok: r.ok, text };
}

function n(x, fallback) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

export async function hikvisionOverview(baseUrl, username, password) {
  const client = new DigestFetch(username, password);
  let analog = 0, ip = 0, onlineHits = 0;
  const analogIdxSet = new Set(), ipIdxSet = new Set();

  try {
    const jr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels?format=json`, "json");
    if (jr.ok && jr.json?.VideoInputChannelList) {
      const list = arr(jr.json.VideoInputChannelList.VideoInputChannel);
      list.forEach((ch, i) => {
        const enabled = typeof ch.videoInputEnabled === "boolean" ? ch.videoInputEnabled : true;
        const desc = String(ch.resDesc ?? "").trim().toUpperCase();
        if (!enabled || desc === "NO VIDEO") return;
        const id =
          n(ch.id, null) ??
          n(ch.channelId, null) ??
          n(ch.logicalChannel, null) ??
          n(ch?.["@_id"], null) ??
          n(ch?.["@_channelNo"], null) ??
          (i + 1);
        if (id != null) analogIdxSet.add(id);
      });
      analog = analogIdxSet.size;
      onlineHits++;
    } else {
      // XML fallback (mesma lógica)
      const xr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels`, "text");
      if (xr.ok && xr.text) {
        const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
        const xml = parser.parse(xr.text);
        arr(xml?.VideoInputChannelList?.VideoInputChannel).forEach((ch, i) => {
          const enabled = String(ch?.videoInputEnabled ?? "true") === "true";
          const desc = String(ch?.resDesc ?? "").trim().toUpperCase();
          if (!enabled || desc === "NO VIDEO") return;
          const id =
            n(ch?.id, null) ??
            n(ch?.channelId, null) ??
            n(ch?.logicalChannel, null) ??
            n(ch?.["@_id"], null) ??
            n(ch?.["@_channelNo"], null) ??
            (i + 1);
          if (id != null) analogIdxSet.add(id);
        });
        analog = analogIdxSet.size;
        onlineHits++;
      }
    }

    const ipr = await req(client, `${baseUrl}/ISAPI/ContentMgmt/InputProxy/channels`, "text");
    if (ipr.ok && ipr.text) {
      const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
      const xml = parser.parse(ipr.text);
      arr(xml?.InputProxyChannelList?.InputProxyChannel).forEach((ch, i) => {
        const id =
          n(ch?.id, null) ??
          n(ch?.logicalChannel, null) ??
          n(ch?.channelId, null) ??
          n(ch?.["@_id"], null) ??
          (i + 1);
        if (id != null) ipIdxSet.add(id);
      });
      ip = ipIdxSet.size;
      onlineHits++;
    }
  } catch (e) {
    dbg("ERR", String(e?.message || e));
  }

  const status = onlineHits > 0 ? "online" : "offline";
  return {
    ok: status === "online",
    status,
    counts: { analog, ip },
    indices: { analog: [...analogIdxSet].sort((a,b)=>a-b), ip: [...ipIdxSet].sort((a,b)=>a-b) }
  };
}

export const jflOverview = hikvisionOverview;
