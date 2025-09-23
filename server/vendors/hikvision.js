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
    const enabled = typeof ch?.videoInputEnabled === "boolean"
      ? ch.videoInputEnabled
      : !/^(false|0)$/i.test(String(ch?.videoInputEnabled ?? "true"))
    if (!enabled) return
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

function parseHddStatusJSON(j){
  const listA = Array.isArray(j?.HDStatus) ? j.HDStatus : []
  const listB = arr(j?.HDStatus?.HDs?.HD)
  const listC = arr(j?.HDStatus?.HD)
  const list = listA.length ? listA : (listB.length ? listB : listC)
  const out = []
  for (let k = 0; k < list.length; k++){
    const it = list[k]
    const idx1 = n(it?.hdNo, NaN)
    const index = Number.isFinite(idx1) ? idx1 - 1 : (n(it?.id, k) || k)
    const vol = n(it?.volume, NaN) || n(it?.capacity, NaN) || n(it?.total, NaN)
    const free = n(it?.freeSpace, NaN) || n(it?.free, NaN)
    const totalBytes = Number.isFinite(vol) ? vol * 1_000_000 : 0
    const freeBytes = Number.isFinite(free) ? free * 1_000_000 : 0
    const usedBytes = Math.max(totalBytes - freeBytes, 0)
    out.push({ index, name: `HD${index+1}`, totalBytes, usedBytes, freeBytes, healthOk: true, state: String(it?.status ?? ""), healthDataFlag: null })
  }
  return out
}

function linesFromDisks(disks){
  const toTB = v => v / 1e12
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
  } catch(e){}
  const status = onlineHits > 0 ? "online" : "offline"
  const toZero = s => [...s].map(v => Number(v) - 1).filter(v => Number.isFinite(v) && v >= 0).sort((a,b)=>a-b)
  return { ok: status === "online", status, counts: { analog, ip }, indices: { analog: toZero(analogIdxSet), ip: toZero(ipIdxSet) } }
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
        const enabled = typeof ch?.videoInputEnabled === "boolean"
          ? ch.videoInputEnabled
          : !/^(false|0)$/i.test(String(ch?.videoInputEnabled ?? "true"))
        const id = n(ch?.id,null) ?? n(ch?.channelId,null) ?? n(ch?.logicalChannel,null) ?? (i+1)
        if (id != null && enabled){
          analogSet.add(id)
          const label = String(ch?.name ?? ch?.resDesc ?? "").trim()
          if (label) analogNames.set(id, label)
        }
      })
    } else {
      const xr = await req(client, `${baseUrl}/ISAPI/System/Video/inputs/channels`, "text")
      if (xr.ok && xr.text){
        const xml = makeParser().parse(xr.text)
        const items = arr(xml?.VideoInputChannelList?.VideoInputChannel)
        items.forEach((ch,i)=>{
          const enabled = !/^(false|0)$/i.test(String(ch?.videoInputEnabled ?? "true"))
          const id = n(ch?.id,null) ?? n(ch?.channelId,null) ?? n(ch?.logicalChannel,null) ?? n(ch?.["@_id"],null) ?? (i+1)
          if (id != null && enabled){
            analogSet.add(id)
            const label = String(ch?.name ?? ch?.resDesc ?? "").trim()
            if (label) analogNames.set(id, label)
          }
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


export async function hikvisionSnapshot(baseUrl, username, password, index0){
  const client = new DigestFetch(username, password)
  const chNo = Number(index0) + 1
  const idMain = chNo * 100 + 1
  const urls = [
    `${baseUrl}/ISAPI/ContentMgmt/StreamingProxy/channels/${idMain}/picture`,
    `${baseUrl}/ISAPI/ContentMgmt/StreamingProxy/channels/${idMain}/picture?snapShotImageType=JPEG`,
    `${baseUrl}/ISAPI/Streaming/channels/${idMain}/picture`,
    `${baseUrl}/ISAPI/ContentMgmt/InputProxy/channels/${chNo}/picture`,
    `${baseUrl}/ISAPI/Streaming/channels/${idMain+1}/picture`,
    `${baseUrl}/ISAPI/Streaming/channels/${chNo}/picture?snapShotImageType=JPEG`
  ]
  for (const u of urls){
    const r = await client.fetch(u, { headers: { Accept: "image/jpeg,*/*" } })
    const ct = r.headers.get("content-type") || ""
    if (r.ok && !/xml|json/i.test(ct)){
      const buf = Buffer.from(await r.arrayBuffer())
      return { ok: true, status: r.status, type: ct || "image/jpeg", buf }
    }
  }
  return { ok: false, status: 502, type: "text/plain", buf: Buffer.from("") }
}

function extractLocalTimeXml(xmlObj){
  const t = String(xmlObj?.Time?.localTime || xmlObj?.localTime || "").trim()
  return t
}

function normalizeIsoAndDmy(s=""){
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,]\d+)?(?:Z|[+\-]\d{2}:\d{2})?/.exec(s)
  if (!m) return { iso: null, dmy: null }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
  const dmy = `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}`
  return { iso, dmy }
}

export async function hikvisionCurrentTime(baseUrl, username, password){
  const client = new DigestFetch(username, password)
  try{
    const jr = await req(client, `${baseUrl}/ISAPI/System/time?format=json`, "json")
    if (jr.ok && jr.json){
      const s = String(jr.json?.Time?.localTime ?? jr.json?.localTime ?? "").trim()
      const { iso, dmy } = normalizeIsoAndDmy(s)
      return { ok: true, status: jr.status, time: dmy, iso, raw: jr.text || "" }
    }
  } catch {}
  try{
    const xr = await req(client, `${baseUrl}/ISAPI/System/time`, "text")
    const xml = xr.text ? makeParser().parse(xr.text) : null
    const s = xml ? String(xml?.Time?.localTime ?? xml?.localTime ?? "").trim() : ""
    const { iso, dmy } = normalizeIsoAndDmy(s)
    return { ok: xr.ok, status: xr.status, time: dmy, iso, raw: xr.text || "" }
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

export async function hikvisionSyncNtp(baseUrl, username, password, opts = {}){
  const client = new DigestFetch(username, password)
  const host = String(opts.host || process.env.NTP_HOST || "a.ntp.br")
  const port = Number(opts.port || process.env.NTP_PORT || 123)
  const intervalMin = Number(opts.intervalMin || process.env.NTP_INTERVAL_MIN || 10)
  const id = Number(opts.serverId || 1)
  const ntpXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NTPServer version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">` +
    `<id>${id}</id>` +
    `<addressingFormatType>host</addressingFormatType>` +
    `<hostName>${host}</hostName>` +
    `<portNo>${port}</portNo>` +
    `<synchronizeInterval>${intervalMin}</synchronizeInterval>` +
    `<enabled>true</enabled>` +
    `</NTPServer>`
  let ok = false
  try{
    const r1 = await client.fetch(`${baseUrl}/ISAPI/System/time/ntpServers/${id}`, { method:"PUT", headers:{ "Content-Type":"application/xml" }, body: ntpXml })
    ok = r1.ok || ok
  }catch{}
  try{
    const j = { Time:{ timeMode:"NTP" } }
    const r2 = await client.fetch(`${baseUrl}/ISAPI/System/time?format=json`, { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(j) })
    ok = r2.ok || ok
    if (!r2.ok){
      const x = `<?xml version="1.0" encoding="UTF-8"?><Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><timeMode>NTP</timeMode></Time>`
      const r2b = await client.fetch(`${baseUrl}/ISAPI/System/time`, { method:"PUT", headers:{ "Content-Type":"application/xml" }, body: x })
      ok = r2b.ok || ok
    }
  }catch{}
  try{
    const r3 = await client.fetch(`${baseUrl}/ISAPI/System/time/ntpServers/${id}/test`, { method:"POST" })
    ok = r3.ok || ok
  }catch{}
  return { ok }
}

export const jflSyncNtp = hikvisionSyncNtp
export const jflOverview = hikvisionOverview
export const jflChannels = hikvisionChannels
export const jflSnapshot = hikvisionSnapshot
export const jflCurrentTime = hikvisionCurrentTime
export const jflHdd = hikvisionHdd
export const jflPing = hikvisionPing

export default hikvisionOverview
