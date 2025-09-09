import DigestFetch from "digest-fetch";

const DBG = process.env.DEBUG_INTEL === "1";
function dbg(...a) { if (DBG) console.log("[intelbras]", ...a); }

async function req(client, url) {
  const t0 = Date.now();
  const r = await client.fetch(url);
  const ms = Date.now() - t0;
  const text = await r.text();
  if (DBG) {
    const ct = r.headers.get("content-type") || "";
    console.log("[intelbras]", "RES", url, r.status, r.statusText, ms + "ms", ct, "len=" + text.length);
  }
  return { ok: r.ok, status: r.status, text };
}

function keepDenseCluster(nums, maxSpan = 32) {
  if (!nums.length) return new Set();
  const arr = [...new Set(nums)].sort((a, b) => a - b);
  let bestI = 0, bestJ = 0;
  for (let i = 0, j = 0; i < arr.length; i++) {
    while (j < arr.length && (arr[j] - arr[i]) <= maxSpan) j++;
    if ((j - i) > (bestJ - bestI)) { bestI = i; bestJ = j; }
  }
  return new Set(arr.slice(bestI, bestJ));
}

function parseEncode(text = "") {
  let m; const idxs = [];
  const re = /(?:^|\n)\s*table\.Encode\[(\d+)\]\./g;
  while ((m = re.exec(text)) !== null) idxs.push(Number(m[1]));
  if (!idxs.length) {
    const re2 = /(?:^|\n)\s*Encode\[(\d+)\]\.MainFormat/g;
    while ((m = re2.exec(text)) !== null) idxs.push(Number(m[1]));
  }
  const keep = keepDenseCluster(idxs, 32);
  return keep.size;
}

function parseRemoteDevice(text = "") {
  const map = new Map();
  const setItem = (id, prop, val) => {
    const key = String(id).trim();
    const cur = map.get(key) || { any: false, en: undefined };
    cur.any = true;
    if (/^Enable$/i.test(prop)) {
      if (/^(true|1|enable|enabled|on)$/i.test(val)) cur.en = true;
      else if (/^(false|0|disable|disabled|off)$/i.test(val)) cur.en = false;
    }
    map.set(key, cur);
  };
  let m;
  const reIdx = /(?:^|\n)\s*table\.RemoteDevice\[(\d+)\]\.([^\=\r\n]+)=([^\r\n]*)/g;
  while ((m = reIdx.exec(text)) !== null) setItem(m[1], m[2].trim(), m[3].trim());
  const reUuid = /(?:^|\n)\s*table\.RemoteDevice\.uuid:([^\.\=\r\n]+)\.([^\=\r\n]+)=([^\r\n]*)/g;
  while ((m = reUuid.exec(text)) !== null) setItem(m[1], m[2].trim(), m[3].trim());
  const reIdxNoTable = /(?:^|\n)\s*RemoteDevice\[(\d+)\]\.([^\=\r\n]+)=([^\r\n]*)/g;
  while ((m = reIdxNoTable.exec(text)) !== null) setItem(m[1], m[2].trim(), m[3].trim());
  const reUuidNoTable = /(?:^|\n)\s*RemoteDevice\.uuid:([^\.\=\r\n]+)\.([^\=\r\n]+)=([^\r\n]*)/g;
  while ((m = reUuidNoTable.exec(text)) !== null) setItem(m[1], m[2].trim(), m[3].trim());
  if (map.size === 0) return 0;
  const numericIds = Array.from(map.keys()).filter(k => /^\d+$/.test(k)).map(Number);
  const keep = keepDenseCluster(numericIds, 32);
  if (keep.size) for (const k of Array.from(map.keys())) if (/^\d+$/.test(k) && !keep.has(Number(k))) map.delete(k);
  const values = Array.from(map.values());
  const hasEnable = values.some(v => v.en !== undefined);
  return hasEnable ? values.filter(v => v.en === true).length : map.size;
}

function sortNum(a, b) { return a - b; }

function parseEncodeIndices(text = "") {
  let m; const idxs = [];
  const re = /(?:^|\n)\s*table\.Encode\[(\d+)\]\./g;
  while ((m = re.exec(text)) !== null) idxs.push(Number(m[1]));
  if (!idxs.length) {
    const re2 = /(?:^|\n)\s*Encode\[(\d+)\]\.MainFormat/g;
    while ((m = re2.exec(text)) !== null) idxs.push(Number(m[1]));
  }
  return keepDenseCluster(idxs, 32);
}

function parseRemoteDeviceIpIndices(text = "") {
  const ipSet = new Set();
  let m;
  const patterns = [
    /(?:^|\n)\s*table\.RemoteDevice\[\d+\]\.Channel\[\d+\]\.(?:Local|Bind|Dst)?(?:Channel|Chn(?:nel)?)\s*=\s*(\d+)/g,
    /(?:^|\n)\s*RemoteDevice\[\d+\]\.Channel\[\d+\]\.(?:Local|Bind|Dst)?(?:Channel|Chn(?:nel)?)\s*=\s*(\d+)/g,
    /(?:^|\n)\s*table\.RemoteDevice\[\d+\]\\.(?:Local|Bind|Dst)?(?:Channel|Chn(?:nel)?)\s*=\s*(\d+)/g,
    /(?:^|\n)\s*RemoteDevice\[\d+\]\\.(?:Local|Bind|Dst)?(?:Channel|Chn(?:nel)?)\s*=\s*(\d+)/g,
    /(?:^|\n)\s*table\.RemoteDevice\[\d+\]\.(?:ChannelID|ChnID)\s*=\s*(\d+)/g,
    /(?:^|\n)\s*RemoteDevice\[\d+\]\.(?:ChannelID|ChnID)\s*=\s*(\d+)/g,
  ];
  for (const re of patterns) while ((m = re.exec(text)) !== null) { const id = Number(m[1]); if (Number.isFinite(id)) ipSet.add(id); }
  return ipSet;
}

export async function intelbrasOverview(baseUrl, username, password) {
  const client = new DigestFetch(username, password);
  let total = 0, ip = 0, onlineHits = 0;
  let encodeText = "", remoteText = "";
  try {
    const r1 = await req(client, `${baseUrl}/cgi-bin/configManager.cgi?action=getConfig&name=Encode`);
    if (r1.ok && r1.text) { encodeText = r1.text; total = parseEncode(r1.text); onlineHits++; }
  } catch {}
  try {
    const r2 = await req(client, `${baseUrl}/cgi-bin/configManager.cgi?action=getConfig&name=RemoteDevice`);
    if (r2.ok && r2.text) { remoteText = r2.text; ip = parseRemoteDevice(r2.text); onlineHits++; }
  } catch {}
  const status = onlineHits > 0 ? "online" : "offline";
  const analog = Math.max(total - ip, 0);
  const allSet = parseEncodeIndices(encodeText);
  const ipSetFromDump = parseRemoteDeviceIpIndices(remoteText);
  const ipSet = new Set();
  if (ipSetFromDump.size) for (const n of ipSetFromDump) if (allSet.has(n)) ipSet.add(n);
  if (!ipSet.size && ip > 0) {
    const sortedAll = [...allSet].sort(sortNum);
    for (let i = sortedAll.length - ip; i < sortedAll.length; i++) if (i >= 0 && sortedAll[i] != null) ipSet.add(sortedAll[i]);
  }
  const analogSet = new Set([...allSet].filter(n => !ipSet.has(n)));
  const analogArr = [...analogSet].sort(sortNum).slice(0, analog);
  const ipArr = [...ipSet].sort(sortNum).slice(0, ip);
  return { ok: status === "online", status, counts: { analog, ip }, indices: { analog: analogArr, ip: ipArr } };
}

export async function intelbrasPing(baseUrl, username, password) {
  const client = new DigestFetch(username, password);
  try {
    const r = await client.fetch(`${baseUrl}/cgi-bin/magicBox.cgi?action=getSystemInfo`);
    return { ok: r.status === 200, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function parseChannelTitles(text = "") {
  const map = new Map();
  let m;
  const patterns = [
    /(?:^|\n)\s*table\.ChannelTitle\[(\d+)\]\.Name=([^\r\n]*)/g,
    /(?:^|\n)\s*ChannelTitle\[(\d+)\]\.Name=([^\r\n]*)/g,
  ];
  for (const re of patterns) while ((m = re.exec(text)) !== null) {
    const idx = Number(m[1]); const name = String(m[2] || "").trim();
    if (Number.isFinite(idx) && name) map.set(idx, name);
  }
  return map;
}

function parseBool(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "on" || s === "enable" || s === "enabled" || s === "connected") return true;
  if (s === "false" || s === "0" || s === "off" || s === "disable" || s === "disabled" || s === "disconnected") return false;
  return null;
}

function parseTextChannelState(text = "") {
  const m = new Map();
  let g;
  const res = [
    /(?:^|\n)\s*State\[(\d+)\]\.(?:Online|Connected)\s*=\s*([^\r\n]+)/g,
    /(?:^|\n)\s*Channel\[(\d+)\]\.(?:Online|Connected)\s*=\s*([^\r\n]+)/g,
    /(?:^|\n)\s*VideoInputChannel\[(\d+)\]\.(?:Online|Connected)\s*=\s*([^\r\n]+)/g,
  ];
  for (const re of res) while ((g = re.exec(text)) !== null) {
    const idx = Number(g[1]); const b = parseBool(g[2]);
    if (Number.isFinite(idx) && b !== null) m.set(idx, b);
  }
  return m;
}

async function tryJsonCameraState(client, baseUrl) {
  try {
    const r = await client.fetch(`${baseUrl}/cgi-bin/api/LogicDeviceManager/getCameraState`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uniqueChannels: [-1] }),
    });
    if (!r.ok) return new Map();
    const j = await r.json().catch(() => null);
    const arr = Array.isArray(j?.states) ? j.states : [];
    const m = new Map();
    for (const it of arr) {
      const ch = Number(it?.channel);
      const st = String(it?.connectionState || "");
      if (Number.isFinite(ch)) m.set(ch, st === "Connected");
    }
    return m;
  } catch {
    return new Map();
  }
}

async function tryTextCameraState(client, baseUrl) {
  const urls = [
    `${baseUrl}/cgi-bin/devVideoInput.cgi?action=getChannelState`,
    `${baseUrl}/cgi-bin/configManager.cgi?action=getConfig&name=Channel`,
  ];
  for (const u of urls) {
    try {
      const r = await req(client, u);
      if (!r.ok || !r.text) continue;
      const m = parseTextChannelState(r.text);
      if (m.size) return m;
    } catch {}
  }
  return new Map();
}

async function fetchCameraStates(client, baseUrl) {
  const a = await tryJsonCameraState(client, baseUrl);
  if (a.size) return a;
  const b = await tryTextCameraState(client, baseUrl);
  return b;
}

export async function intelbrasChannels(baseUrl, username, password) {
  const client = new DigestFetch(username, password);
  let encodeText = "", titleText = "";
  try { const r1 = await req(client, `${baseUrl}/cgi-bin/configManager.cgi?action=getConfig&name=Encode`); if (r1.ok) encodeText = r1.text; } catch {}
  try { const r2 = await req(client, `${baseUrl}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`); if (r2.ok) titleText = r2.text; } catch {}
  const allSet = parseEncodeIndices(encodeText);
  const names = parseChannelTitles(titleText);
  const idxs = [...allSet].sort(sortNum);
  let states = new Map();
  try { states = await fetchCameraStates(client, baseUrl); } catch { states = new Map(); }
  const channels = idxs.map(i => {
    const on = states.get(i) ?? states.get(i + 1) ?? null;
    return { index: i, name: names.get(i) || `CAM ${i + 1}`, online: typeof on === "boolean" ? on : null };
  });
  return { ok: true, channels };
}

export async function intelbrasSnapshot(baseUrl, username, password, index0) {
  const ch = Number(index0) + 1
  const client = new DigestFetch(username, password)
  const r = await client.fetch(`${baseUrl}/cgi-bin/snapshot.cgi?channel=${ch}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const type = r.headers.get("content-type") || "image/jpeg"
  return { ok: r.ok, status: r.status, type, buf }
}

function extractTimeString(text = "") {
  let m;
  const res = [
    /currentTime(?:=|:)\s*([^\r\n]+)/i,
    /LocalTime(?:=|:)\s*([^\r\n]+)/i,
    /DeviceTime(?:=|:)\s*([^\r\n]+)/i,
  ];
  for (const re of res) { m = re.exec(text); if (m) return String(m[1]).trim(); }
  m = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/.exec(text);
  return m ? String(m[1]).trim() : "";
}

function normalizeTimeString(s = "") {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return { value: s || null, iso: null };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  return { value: s, iso };
}

export async function intelbrasCurrentTime(baseUrl, username, password) {
  const client = new DigestFetch(username, password);
  try {
    const r = await req(client, `${baseUrl}/cgi-bin/global.cgi?action=getCurrentTime`);
    let time = null, iso = null, raw = r.text || "";
    if (r.ok && raw) {
      const s = extractTimeString(raw);
      const n = normalizeTimeString(s);
      time = n.value;
      iso = n.iso;
    }
    return { ok: r.ok, status: r.status, time, iso, raw };
  } catch {
    return { ok: false, status: 0, time: null, iso: null, raw: "" };
  }
}

export async function intelbrasSyncNtp(baseUrl, username, password, address = "a.ntp.br") {
  const client = new DigestFetch(username, password)
  const url = `${baseUrl}/cgi-bin/configManager.cgi?action=setConfig&NTP.Address=${encodeURIComponent(address)}&NTP.Enable=true`
  try {
    const r = await req(client, url)
    return { ok: r.ok, status: r.status, text: r.text }
  } catch {
    return { ok: false, status: 0, text: "" }
  }
}

function parseStorageDeviceInfo(text = "", usedDetailIndex = 1) {
  const totals = new Map()
  const useds = new Map()
  const meta = new Map()
  let m
  const reDetail = /(?:^|\n)\s*list\.info\[(\d+)\]\.Detail\[(\d+)\]\.(TotalBytes|UsedBytes|IsError|Path|Type)\s*=\s*([^\r\n]*)/g
  while ((m = reDetail.exec(text)) !== null) {
    const i = Number(m[1])
    const j = Number(m[2])
    const k = String(m[3]).trim()
    const v = String(m[4]).trim()
    if (k === "TotalBytes") totals.set(i, (totals.get(i) || 0) + parseFloat(v))
    else if (k === "UsedBytes") {
      if (usedDetailIndex == null || j === usedDetailIndex) useds.set(i, (useds.get(i) || 0) + parseFloat(v))
    }
  }
  const reMeta = /(?:^|\n)\s*list\.info\[(\d+)\]\.(Name|HealthDataFlag|State)\s*=\s*([^\r\n]*)/g
  while ((m = reMeta.exec(text)) !== null) {
    const i = Number(m[1])
    const k = String(m[2]).trim()
    const v = String(m[3]).trim()
    const cur = meta.get(i) || {}
    cur[k] = v
    meta.set(i, cur)
  }
  const idxs = Array.from(new Set([...totals.keys(), ...useds.keys(), ...meta.keys()])).sort((a,b)=>a-b)
  const toTB = n => n / (1024 ** 4)
  const lines = []
  const disks = []
  for (const i of idxs) {
    const totalB = totals.get(i) || 0
    const usedB = useds.get(i) || 0
    const freeB = Math.max(totalB - usedB, 0)
    const mt = meta.get(i) || {}
    const state = String(mt.State || "")
    const hdf = Number(mt.HealthDataFlag != null ? mt.HealthDataFlag : NaN)
    const healthOk = (hdf === 0) && /^success$/i.test(state)
    const totalTB = toTB(totalB)
    const usedTB = toTB(usedB)
    lines.push(`HD ${i + 1} total: ${totalTB.toFixed(2)} TB usado: ${usedTB.toFixed(2)} TB`)
    disks.push({ index: i, name: String(mt.Name || `HD${i+1}`), totalBytes: totalB, usedBytes: usedB, freeBytes: freeB, healthOk, state, healthDataFlag: isNaN(hdf) ? null : hdf })
  }
  return { lines, disks }
}

export async function intelbrasHdd(baseUrl, username, password) {
  const client = new DigestFetch(username, password)
  try {
    const r = await req(client, `${baseUrl}/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo`)
    if (!r.ok) return { ok: false, status: r.status, hddLines: [], disks: [], raw: r.text || "" }
    const parsed = parseStorageDeviceInfo(r.text || "", null)
    return { ok: true, status: r.status, hddLines: parsed.lines, disks: parsed.disks, raw: r.text || "" }
  } catch {
    return { ok: false, status: 0, hddLines: [], disks: [], raw: "" }
  }
}



export default intelbrasOverview;
