import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hikvisionOverview, jflOverview } from "./vendors/hikvision.js";
import { intelbrasOverview, intelbrasChannels, intelbrasPing, intelbrasSnapshot, intelbrasCurrentTime, intelbrasSyncNtp } from "./vendors/intelbras.js"

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLIENTS_PATH = path.resolve(ROOT, "public/clients.json");

const state = { clients: [], dvrs: new Map(), sse: new Set() };
const LOG = process.env.API_LOG === "1";
const pollEnabled = process.env.POLL_ENABLED !== "0";

function log(...a) { if (LOG) console.log(...a); }

function loadClients() {
  try {
    const raw = fs.readFileSync(CLIENTS_PATH, "utf8");
    const j = JSON.parse(raw);
    state.clients = Array.isArray(j.clients) ? j.clients : [];
  } catch {
    state.clients = [];
  }
}

function dvrBaseUrl(dvr) {
  const host = dvr.auth?.ddns || dvr.auth?.ip;
  const port = dvr.auth?.httpPort;
  if (!host || !port) return null;
  return `http://${host}:${port}`;
}

function findDvrById(id) {
  for (const c of state.clients) for (const d of c.dvrs || []) if (d.id === id) return d;
  return null;
}

function publishDvr(dvrId, data) {
  const prev = state.dvrs.get(dvrId) || {};
  const next = { ...prev, ...data, lastUpdated: Date.now() };
  state.dvrs.set(dvrId, next);
  const payload = JSON.stringify({ dvrId, data: next });
  for (const res of state.sse) res.write(`event: dvr\ndata: ${payload}\n\n`);
}

async function computeOverview(dvr) {
  const baseUrl = dvrBaseUrl(dvr);
  if (!baseUrl) return { ok: false, status: "unknown" };
  if (dvr.vendor === "hikvision") return hikvisionOverview(baseUrl, dvr.auth.username, dvr.auth.password);
  if (dvr.vendor === "jfl") return jflOverview(baseUrl, dvr.auth.username, dvr.auth.password);
  if (dvr.vendor === "intelbras") return intelbrasOverview(baseUrl, dvr.auth.username, dvr.auth.password);
  return { ok: false, status: "unknown" };
}

function startPolling() {
  const all = [];
  for (const c of state.clients) for (const d of c.dvrs || []) all.push({ d });
  all.forEach(({ d }, idx) => {
    let interval = Number(process.env.POLL_INTERVAL_MS || 60000);
    let backoff = 1;
    const tick = async () => {
      const t0 = Date.now();
      try {
        const r = await computeOverview(d);
        const ms = Date.now() - t0;
        if (r.ok) {
          backoff = 1;
          publishDvr(d.id, { status: r.status, counts: r.counts });
          log("[poll]", d.id, r.status, JSON.stringify(r.counts || {}), ms + "ms");
        } else {
          backoff = Math.min(backoff * 2, 8);
          publishDvr(d.id, { status: r.status || "offline" });
          log("[poll]", d.id, r.status || "offline", ms + "ms");
        }
      } catch {
        backoff = Math.min(backoff * 2, 8);
        publishDvr(d.id, { status: "offline" });
        log("[poll]", d.id, "offline");
      }
      setTimeout(tick, interval * backoff + Math.floor(Math.random() * 1000));
    };
    setTimeout(tick, idx * 400);
  });
}

app.get("/api/summary", (_, res) => {
  const out = state.clients.map(c => ({
    id: c.id,
    name: c.name,
    dvrs: (c.dvrs || []).map(d => {
      const snap = state.dvrs.get(d.id) || {};
      return {
        id: d.id,
        name: d.name,
        vendor: d.vendor,
        declaredChannels: d.declaredChannels,
        status: snap.status || "unknown",
        counts: snap.counts || undefined,
        lastUpdated: snap.lastUpdated || null,
        auth: d.auth
      };
    })
  }));
  res.json({ clients: out });
});

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  state.sse.add(res);
  const id = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 15000);
  req.on("close", () => { clearInterval(id); state.sse.delete(res); });
});

app.get("/api/dvrs/:id/ping", async (req, res) => {
  const t0 = Date.now();
  try {
    const dvr = findDvrById(req.params.id);
    if (!dvr) return res.sendStatus(404);
    const baseUrl = dvrBaseUrl(dvr);
    if (!baseUrl) return res.sendStatus(400);
    if (dvr.vendor === "intelbras") {
      const r = await intelbrasPing(baseUrl, dvr.auth.username, dvr.auth.password);
      const ms = Date.now() - t0;
      log("[api] ping", dvr.id, r.ok ? "online" : "offline", ms + "ms");
      return res.sendStatus(r.ok ? 200 : 503);
    }
    return res.sendStatus(501);
  } catch {
    const ms = Date.now() - t0;
    log("[api] ping", req.params.id, "unknown", ms + "ms");
    return res.sendStatus(500);
  }
});

app.get("/api/dvrs/:id/overview", async (req, res) => {
  const t0 = Date.now();
  try {
    const dvr = findDvrById(req.params.id);
    if (!dvr) return res.sendStatus(404);
    const baseUrl = dvrBaseUrl(dvr);
    if (!baseUrl) return res.sendStatus(400);
    if (dvr.vendor === "intelbras") {
      const r = await intelbrasOverview(baseUrl, dvr.auth.username, dvr.auth.password);
      const ms = Date.now() - t0;
      log("[api] overview", dvr.id, r.status, JSON.stringify(r.counts || {}), ms + "ms");
      return res.json({ status: r.status, counts: r.counts, indices: r.indices });
    }
    return res.status(501).json({ status: "unknown" });
  } catch {
    const ms = Date.now() - t0;
    log("[api] overview", req.params.id, "unknown", ms + "ms");
    return res.status(500).json({ status: "unknown" });
  }
});

app.get("/api/dvrs/:id/channels", async (req, res) => {
  const t0 = Date.now()
  try {
    const dvr = findDvrById(req.params.id)
    if (!dvr) return res.sendStatus(404)
    const baseUrl = dvrBaseUrl(dvr)
    if (!baseUrl) return res.sendStatus(400)
    if (dvr.vendor === "intelbras") {
      const r = await intelbrasChannels(baseUrl, dvr.auth.username, dvr.auth.password)
      const ms = Date.now() - t0
      log("[api] channels", dvr.id, (r.channels || []).length, "itens", ms + "ms")
      return res.json({ channels: r.channels || [] })
    }
    return res.status(501).json({ channels: [] })
  } catch (err) {
    const ms = Date.now() - t0
    log("[api] channels", req.params.id, "erro", ms + "ms", err?.message || err)
    return res.status(200).json({ channels: [] })
  }
})


app.get("/api/dvrs/:id/snapshot/:index", async (req, res) => {
  try {
    const dvr = findDvrById(req.params.id)
    if (!dvr) return res.sendStatus(404)
    const baseUrl = dvrBaseUrl(dvr)
    if (!baseUrl) return res.sendStatus(400)
    if (dvr.vendor !== "intelbras") return res.sendStatus(501)
    const r = await intelbrasSnapshot(baseUrl, dvr.auth.username, dvr.auth.password, Number(req.params.index||0))
    res.status(r.ok ? 200 : 502).setHeader("Content-Type", r.type).send(r.buf)
  } catch { res.sendStatus(500) }
})

app.get("/api/dvrs/:id/current-time", async (req, res) => {
  const t0 = Date.now()
  try {
    const dvr = findDvrById(req.params.id)
    if (!dvr) return res.sendStatus(404)
    const baseUrl = dvrBaseUrl(dvr)
    if (!baseUrl) return res.sendStatus(400)
    if (dvr.vendor !== "intelbras") return res.status(501).json({ timeText: null, iso: null })
    const r = await intelbrasCurrentTime(baseUrl, dvr.auth.username, dvr.auth.password)
    const ms = Date.now() - t0
    log("[api] current-time", dvr.id, r.ok ? "ok" : "fail", ms + "ms")
    return res.json({ timeText: r.time || r.iso || "-", iso: r.iso || null })
  } catch {
    const ms = Date.now() - t0
    log("[api] current-time", req.params.id, "error", ms + "ms")
    return res.status(500).json({ timeText: null, iso: null })
  }
})

app.get("/api/dvrs/:id/ntp-sync", async (req, res) => {
  const t0 = Date.now()
  try {
    const dvr = findDvrById(req.params.id)
    if (!dvr) return res.sendStatus(404)
    const baseUrl = dvrBaseUrl(dvr)
    if (!baseUrl) return res.sendStatus(400)
    if (dvr.vendor !== "intelbras") return res.status(501).json({ ok: false })
    const r = await intelbrasSyncNtp(baseUrl, dvr.auth.username, dvr.auth.password)
    const ms = Date.now() - t0
    log("[api] ntp-sync", dvr.id, r.ok ? "ok" : "fail", ms + "ms")
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok })
  } catch (err) {
    const ms = Date.now() - t0
    log("[api] ntp-sync", req.params.id, "error", ms + "ms")
    return res.status(500).json({ ok: false })
  }
})


loadClients();
if (pollEnabled) startPolling();

const port = Number(process.env.PORT || 3001);
app.listen(port);
