// vendors/hikvision.js
import DigestFetch from "digest-fetch"
import { XMLParser } from "fast-xml-parser"

const DBG = process.env.DEBUG_HIK === "1"
function dbg(...a){ if(DBG) console.log("[hikvision]", ...a) }
function arr(x){ return Array.isArray(x) ? x : x == null ? [] : [x] }
function n(x,f){ const v = Number(x); return Number.isFinite(v) ? v : f }

async function req(client, url, mode){
  const t0 = Date.now()
  const r = await client.fetch(url)
  const ms = Date.now() - t0
  const ct = r.headers.get("content-type") || ""
  const text = await r.text()
  if (DBG) console.log("[hikvision]", "RES", url, r.status, r.statusText, ms + "ms", ct, "len=" + text.length)
  if (mode === "json" && ct.includes("json")){
    try { return { ok:r.ok, status:r.status, json: JSON.parse(text), text } } catch { return { ok:r.ok, status:r.status, json:null, text } }
  }
  return { ok:r.ok, status:r.status, text }
}

function makeParser(){
  return new XMLParser({ ignoreAttributes:false, trimValues:true })
}

function mapAnalogIdsFromVideoInputs(jsonOrXml){
  const list = jsonOrXml?.VideoInputChannelList?.VideoInputChannel
  const items = arr(list)
  const set = new Set()
  items.forEach((ch,i)=>{
    const enabled = typeof ch?.videoInputEnabled === "boolean" ? ch.videoInputEnabled : String(ch?.videoInputEnabled ?? "true").toLowerCase() !== "false"
    const desc = String(ch?.resDesc ?? "").trim().toUpperCase()
    if (!enabled || desc === "NO VIDEO") return
    const id = n(ch?.id,null) ?? n(ch?.channelId,null) ?? n(ch?.logicalChannel,null) ?? n(ch?.["@_id"],null) ?? n(ch?.["@_channelNo"],null) ?? (i+1)
    if (id != null) set.add(id)
  })
  return set
}

function mapIpIdsFromInputProxy(xmlObj){
  const items = arr(xmlObj?.InputProxyChannelList?.InputProxyChannel)
  const set = new Set()
  items.forEach((ch,i)=>{
    const id = n(ch?.id,null) ?? n(ch?.logicalChannel,null) ?? n(ch?.channelId,null) ?? n(ch?.["@_id"],null) ?? (i+1)
    if (id != null) set.add(id)
  })
  return set
}

function idToStreamingChannelId(logical){
  if (!Number.isFinite(logical)) return null
  if (logical >= 100) return logical
  return logical * 100 + 1
}

function parseChanStatusJSON(j){
  const m = new Map()
  const list = arr(j?.ChanStatusList?.ChanStatus) || arr(j?.chanStatus)
  for (const it of list){
    const id = n(it?.id, null) ?? n(it?.channel, null) ?? n(it?.chan, null)
    const s = String(it?.online ?? it?.status ?? it?.state ?? "").toLowerCase()
    const on = s === "true" || s === "1" || s === "online" || s === "connected"
    if (id != null) m.set(id, on)
  }
  return m
}

function parseHddStatusJSON(j){
  const arrH = arr(j?.HDStatus?.HDs?.HD) || arr(j?.hdd) || arr(j?.HDStatus?.HD)
  const out = []
  for (const it of arrH){
    const i = n(it?.id, out.length) || out.length
    let totalMB = n(it?.capacity, NaN)
    let freeMB = n(it?.freeSpace, NaN)
    if (!Number.isFinite(totalMB) && Number.isFinite(n(it?.total, NaN))) totalMB = n(it?.total, NaN)
    if (!Number.isFinite(freeMB) && Number.isFinite(n(it?.free, NaN))) freeMB = n(it?.free, NaN)
    const totalBytes = Number.isFinite(totalMB) ? totalMB * 1024 * 1024 : 0
    const freeBytes = Number.isFinite(freeMB) ? freeMB * 1024 * 1024 : 0
    const usedBytes = Math.max(totalBytes - freeBytes, 0)
    out.push({ index:i, name:String(it?.name || `HD${i+1}`), totalBytes, usedBytes, freeBytes, healthOk: true, state: String(it?.status || ""), healthDataFlag: null })
  }
  return out
}

function parseHddFromXML(xmlObj){
  const list = arr(xmlObj?.hddList?.hdd) || arr(xmlObj?.hdd)
  const out = []
  for (let k=0;k<list.length;k++){
    const it = list[k]
    const i = n(it?.id, k) || k
    const cap = n(it?.capacity, NaN) || n(it?.totalSpace, NaN) || n(it?.size, NaN)
    const free = n(it?.freeSpace, NaN) || n(it?.free, NaN)
    let totalBytes = 0, freeBytes = 0
    if (Number.isFinite(cap) && cap < 50*1024*1024) { totalBytes = cap * 1024 * 1024; freeBytes = Number.isFinite(free) ? free * 1024 * 1024 : 0 }
    else if (Number.isFinite(cap) && cap < 50*1024) { totalBytes = cap * 1024 * 1024 * 1024; freeBytes = Number.isFinite(free) ? free * 1024 * 1024 * 1024 : 0 }
    else { totalBytes = Number.isFinite(cap) ? cap : 0; freeBytes = Number.isFinite(free) ? free : 0 }
    const usedBytes = Math.max(totalBytes - freeBytes, 0)
    out.push({ index:i, name:String(it?.name || `HD${i+1}`), totalBytes, usedBytes, freeBytes, healthOk:true, state:String(it?.status || ""), healthDataFlag:null })
  }
  return out
}

function linesFromDisks(disks){
  const toTB = v => v / (1024**4)
  return disks.map(d => `HD ${d.index + 1} total: ${toTB(d.totalBytes).toFixed(2)} TB usado: ${toTB(d.usedBytes).toFixed(2)} TB`)
}

export async function hikvisionOverview(baseUrl, username, password){
  const client = new DigestFetch(username, password)
  let analog = 0, ip = 0, onlineHits = 0
  const analogIdxSet = new Set(), ipIdxSet = new Set()
  try{
    const jr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels?format=json`, "json")
    if (jr.ok && jr.json?.VideoInputChannelList){
      for (const id of mapAnalogIdsFromVideoInputs(jr.json)) analogIdxSet.add(id)
      analog = analogIdxSet.size
      onlineHits++
    } else {
      const xr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels`, "text")
      if (xr.ok && xr.text){
        const xml = makeParser().parse(xr.text)
        for (const id of mapAnalogIdsFromVideoInputs(xml)) analogIdxSet.add(id)
        analog = analogIdxSet.size
        onlineHits++
      }
    }
    const ipr = await req(client, `${baseUrl}/ISAPI/ContentMgmt/InputProxy/channels`, "text")
    if (ipr.ok && ipr.text){
      const xml = makeParser().parse(ipr.text)
      for (const id of mapIpIdsFromInputProxy(xml)) ipIdxSet.add(id)
      ip = ipIdxSet.size
      onlineHits++
    }
  } catch(e){ dbg("ERR", String(e?.message || e)) }
  const status = onlineHits > 0 ? "online" : "offline"
  return { ok: status === "online", status, counts: { analog, ip }, indices: { analog:[...analogIdxSet].sort((a,b)=>a-b), ip:[...ipIdxSet].sort((a,b)=>a-b) } }
}

export async function hikvisionChannels(baseUrl, username, password){
  const client = new DigestFetch(username, password)
  let analogSet = new Set(), ipSet = new Set()
  let analogNames = new Map()
  try{
    const jr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels?format=json`, "json")
    if (jr.ok && jr.json?.VideoInputChannelList){
      const list = arr(jr.json.VideoInputChannelList.VideoInputChannel)
      list.forEach((ch,i)=>{
        const enabled = typeof ch?.videoInputEnabled === "boolean" ? ch.videoInputEnabled : String(ch?.videoInputEnabled ?? "true").toLowerCase() !== "false"
        const desc = String(ch?.resDesc ?? "").trim()
        const id = n(ch?.id,null) ?? n(ch?.channelId,null) ?? n(ch?.logicalChannel,null) ?? (i+1)
        if (id != null && enabled){ analogSet.add(id); if (desc) analogNames.set(id, desc) }
      })
    } else {
      const xr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels`, "text")
      if (xr.ok && xr.text){
        const xml = makeParser().parse(xr.text)
        const items = arr(xml?.VideoInputChannelList?.VideoInputChannel)
        items.forEach((ch,i)=>{
          const enabled = String(ch?.videoInputEnabled ?? "true") !== "false"
          const id = n(ch?.id,null) ?? n(ch?.channelId,null) ?? n(ch?.logicalChannel,null) ?? n(ch?.["@_id"],null) ?? (i+1)
          if (id != null && enabled){ analogSet.add(id); if (ch?.resDesc) analogNames.set(id, String(ch.resDesc)) }
        })
      }
    }
  } catch {}
  try{
    const ipr = await req(client, `${baseUrl}/ISAPI/ContentMgmt/InputProxy/channels`, "text")
    if (ipr.ok && ipr.text){
      const xml = makeParser().parse(ipr.text)
      for (const id of mapIpIdsFromInputProxy(xml)) ipSet.add(id)
    }
  } catch {}
  let states = new Map()
  try{
    const sr = await req(client, `${baseUrl}/ISAPI/System/workingstatus/chanStatus?format=json`, "json")
    if (sr.ok && sr.json) states = parseChanStatusJSON(sr.json)
  } catch {}
  const allIds = [...new Set([...analogSet, ...ipSet])].sort((a,b)=>a-b)
  const channels = allIds.map(id=>{
    const on = states.get(id)
    const name = analogNames.get(id) || `CAM ${id}`
    return { index: id, name, online: typeof on === "boolean" ? on : null }
  })
  return { ok: true, channels }
}

export async function hikvisionSnapshot(baseUrl, username, password, indexOrId){
  const logical = Number(indexOrId)
  const chId = idToStreamingChannelId(logical < 100 ? logical+1 : logical)
  const client = new DigestFetch(username, password)
  const r = await client.fetch(`${baseUrl}/ISAPI/Streaming/channels/${chId}/picture`)
  const buf = Buffer.from(await r.arrayBuffer())
  const type = r.headers.get("content-type") || "image/jpeg"
  return { ok: r.ok, status: r.status, type, buf }
}

function extractLocalTimeXml(xmlObj){
  const t = String(xmlObj?.Time?.localTime || xmlObj?.localTime || "").trim()
  return t
}

function normalizeIso(s=""){
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s)
  if (!m) return { value: s || null, iso: null }
  return { value: s, iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` }
}

export async function hikvisionCurrentTime(baseUrl, username, password){
  const client = new DigestFetch(username, password)
  try{
    const jr = await req(client, `${baseUrl}/ISAPI/System/time?format=json`, "json")
    if (jr.ok && jr.json){
      const s = String(jr.json?.Time?.localTime ?? jr.json?.localTime ?? "").trim()
      const nrm = normalizeIso(s)
      return { ok: true, status: jr.status, time: nrm.value, iso: nrm.iso, raw: jr.text || "" }
    }
  } catch {}
  try{
    const xr = await req(client, `${baseUrl}/ISAPI/System/time`, "text")
    const xml = xr.text ? makeParser().parse(xr.text) : null
    const s = xml ? extractLocalTimeXml(xml) : ""
    const nrm = normalizeIso(s)
    return { ok: xr.ok, status: xr.status, time: nrm.value, iso: nrm.iso, raw: xr.text || "" }
  } catch {
    return { ok: false, status: 0, time: null, iso: null, raw: "" }
  }
}

export async function hikvisionHdd(baseUrl, username, password){
  const client = new DigestFetch(username, password)
  try{
    const jr = await req(client, `${baseUrl}/ISAPI/System/workingstatus/hdStatus?format=json`, "json")
    if (jr.ok && jr.json){
      const disks = parseHddStatusJSON(jr.json)
      return { ok: true, status: jr.status, hddLines: linesFromDisks(disks), disks, raw: jr.text || "" }
    }
  } catch {}
  try{
    const xr = await req(client, `${baseUrl}/ISAPI/ContentMgmt/Storage/hdd`, "text")
    if (!xr.ok) return { ok: false, status: xr.status, hddLines: [], disks: [], raw: xr.text || "" }
    const xml = makeParser().parse(xr.text)
    const disks = parseHddFromXML(xml)
    return { ok: true, status: xr.status, hddLines: linesFromDisks(disks), disks, raw: xr.text || "" }
  } catch {
    return { ok: false, status: 0, hddLines: [], disks: [], raw: "" }
  }
}

export async function hikvisionPing(baseUrl, username, password){
  const client = new DigestFetch(username, password)
  try{
    const r = await client.fetch(`${baseUrl}/ISAPI/System/deviceInfo`)
    return { ok: r.status === 200, status: r.status }
  } catch { return { ok:false, status:0 } }
}

export const jflOverview = hikvisionOverview
export const jflChannels = hikvisionChannels
export const jflSnapshot = hikvisionSnapshot
export const jflCurrentTime = hikvisionCurrentTime
export const jflHdd = hikvisionHdd
export const jflPing = hikvisionPing

export default hikvisionOverview
