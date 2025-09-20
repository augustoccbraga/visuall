import { create } from "zustand"
import { devtools, persist, createJSONStorage } from "zustand/middleware"
import type { StateStorage } from "zustand/middleware"
import type { DVR, Channel, DvrStatus, DvrCounts, DvrIndices, OverviewResponse, ChannelsResponse } from "../types"

export interface DvrEntry {
  id: string
  name: string
  vendor: DVR["vendor"]
  declaredChannels?: number
  auth?: DVR["auth"]
  status: DvrStatus
  counts?: DvrCounts
  indices?: DvrIndices
  channels?: Channel[]
  lastOverviewAt?: number
  lastChannelsAt?: number
  lastStatusAt?: number
}

type StoreState = {
  byId: Record<string, DvrEntry>
  activeDvrId?: string
  upsertDvrMeta: (dvr: DVR) => void
  bootstrapFromClients: (clients: Array<{ dvrs: DVR[] }>) => Promise<void>
  fetchOverviewForAll: (dvrs: DVR[]) => Promise<void>
  fetchOverview: (dvr: DVR) => Promise<void>
  setOverview: (dvrId: string, payload: { status: DvrStatus; counts?: DvrCounts; indices?: DvrIndices }) => void
  fetchChannelsIfStale: (dvr: DVR, force?: boolean) => Promise<void>
  setChannels: (dvrId: string, channels: Channel[]) => void
  setChannelOnline: (dvrId: string, channelIndex: number, online: boolean | null) => void
  setActiveDvr: (dvrId: string | undefined) => void
  removeDvr: (dvrId: string) => void
  clearAll: () => void
  touch: (dvrId: string) => void
  getResolvedCounts: (dvrId: string) => { total: number; analog?: number; ip?: number }
  setStatus: (dvrId: string, status: DvrStatus) => void
}

const isBrowser = typeof window !== "undefined"
const memoryStorage = (): StateStorage => {
  let store: Record<string, string | null> = {}
  return {
    getItem: (name) => (name in store ? store[name]! : null),
    setItem: (name, value) => { store[name] = value },
    removeItem: (name) => { delete store[name] },
  }
}
const chosenStorage: StateStorage = isBrowser ? createJSONStorage(() => sessionStorage) : memoryStorage()

const PERSIST_TTL_MS = 5 * 60 * 1000
const OVERVIEW_TTL_MS = 60 * 1000
const CHANNELS_TTL_MS = 30 * 1000
const STATUS_TTL_MS = 15 * 1000

const API_BASE = ((import.meta as any).env?.VITE_API_BASE || "/api").replace(/\/+$/,"")

const inflight = {
  status: new Set<string>(),
  overview: new Set<string>(),
  channels: new Set<string>(),
}

async function requestOverviewFromBackend(dvr: DVR): Promise<OverviewResponse> {
  const url = `${API_BASE}/dvrs/${encodeURIComponent(dvr.id)}/overview`
  const t0 = Date.now()
  console.log("[req] overview ->", url)
  const r = await fetch(url, { method: "GET" })
  console.log("[res] overview <-", url, r.status, Date.now() - t0 + "ms")
  if (!r.ok) throw new Error(`overview ${r.status}`)
  return (await r.json()) as OverviewResponse
}

async function requestChannelsFromBackend(dvr: DVR): Promise<ChannelsResponse> {
  const url = `${API_BASE}/dvrs/${encodeURIComponent(dvr.id)}/channels`
  const t0 = Date.now()
  console.log("[req] channels ->", url)
  const r = await fetch(url, { method: "GET" })
  console.log("[res] channels <-", url, r.status, Date.now() - t0 + "ms")
  if (!r.ok) throw new Error(`channels ${r.status}`)
  return (await r.json()) as ChannelsResponse
}

async function requestPing(dvr: DVR): Promise<DvrStatus> {
  const url = `${API_BASE}/dvrs/${encodeURIComponent(dvr.id)}/ping`
  const t0 = Date.now()
  try {
    console.log("[req] ping ->", url)
    const r = await fetch(url, { method: "GET" })
    console.log("[res] ping <-", url, r.status, Date.now() - t0 + "ms")
    return r.status === 200 ? "online" : "offline"
  } catch {
    console.log("[res] ping <-", url, "error", Date.now() - t0 + "ms")
    return "unknown"
  }
}

export const useDvrStore = create<StoreState>()(
  devtools(
    persist(
      (set, get) => ({
        byId: {},
        activeDvrId: undefined,

        upsertDvrMeta: (dvr) =>
          set((s) => {
            const cur = s.byId[dvr.id] || ({} as DvrEntry)
            return {
              byId: {
                ...s.byId,
                [dvr.id]: {
                  id: dvr.id,
                  name: dvr.name,
                  vendor: dvr.vendor,
                  declaredChannels: dvr.declaredChannels,
                  auth: dvr.auth,
                  status: cur.status ?? "unknown",
                  counts: cur.counts,
                  indices: cur.indices,
                  channels: cur.channels,
                  lastOverviewAt: cur.lastOverviewAt,
                  lastChannelsAt: cur.lastChannelsAt,
                  lastStatusAt: cur.lastStatusAt,
                },
              },
            }
          }, false, "dvr/upsertMeta"),

        bootstrapFromClients: async (clients) => {
          clients.forEach((c) => c.dvrs.forEach((d) => get().upsertDvrMeta(d)))
          const allDvrs = clients.flatMap((c) => c.dvrs)
          await get().fetchOverviewForAll(allDvrs)
        },

        fetchOverviewForAll: async (dvrs) => {
          await Promise.all(dvrs.map((dvr) => get().fetchOverview(dvr).catch(() => {})))
        },

        fetchOverview: async (dvr) => {
          if (!get().byId[dvr.id]) get().upsertDvrMeta(dvr)

          const cur0 = get().byId[dvr.id]
          const now = Date.now()
          if ((!cur0?.lastStatusAt || now - cur0.lastStatusAt > STATUS_TTL_MS) && !inflight.status.has(dvr.id)) {
            inflight.status.add(dvr.id)
            try {
              const st = await requestPing(dvr)
              get().setStatus(dvr.id, st)
            } finally {
              inflight.status.delete(dvr.id)
            }
          }

          const cur1 = get().byId[dvr.id]
          if (cur1?.lastOverviewAt && now - cur1.lastOverviewAt < OVERVIEW_TTL_MS) return
          if (inflight.overview.has(dvr.id)) return
          inflight.overview.add(dvr.id)
          try {
            const data = await requestOverviewFromBackend(dvr)
            get().setOverview(dvr.id, { status: data.status ?? (get().byId[dvr.id]?.status || "unknown"), counts: data.counts, indices: data.indices })
          } finally {
            inflight.overview.delete(dvr.id)
          }
        },

        setOverview: (dvrId, { status, counts, indices }) =>
          set((s) => {
            const cur = s.byId[dvrId] || ({ id: dvrId, name: dvrId, vendor: "intelbras", status: "unknown" } as DvrEntry)
            return { byId: { ...s.byId, [dvrId]: { ...cur, vendor: cur.vendor ?? "intelbras", status, counts, indices, lastOverviewAt: Date.now() } } }
          }, false, "dvr/setOverview"),

        fetchChannelsIfStale: async (dvr, force = false) => {
          if (!get().byId[dvr.id]) get().upsertDvrMeta(dvr)
          const cur = get().byId[dvr.id]
          const now = Date.now()
          const stale = !cur?.lastChannelsAt || now - (cur.lastChannelsAt || 0) > CHANNELS_TTL_MS
          if (!force && !stale) return
          if (inflight.channels.has(dvr.id)) return
          inflight.channels.add(dvr.id)
          try {
            const { channels } = await requestChannelsFromBackend(dvr)
            get().setChannels(dvr.id, channels)
          } finally {
            inflight.channels.delete(dvr.id)
          }
        },

        setChannels: (dvrId, channels) =>
          set((s) => {
            const cur = s.byId[dvrId] || ({ id: dvrId, name: dvrId, vendor: "intelbras", status: "unknown" } as DvrEntry)
            return { byId: { ...s.byId, [dvrId]: { ...cur, vendor: cur.vendor ?? "intelbras", channels: [...channels], lastChannelsAt: Date.now() } } }
          }, false, "dvr/setChannels"),

        setChannelOnline: (dvrId, channelIndex, online) =>
          set((s) => {
            const cur = s.byId[dvrId]
            if (!cur || !cur.channels) return s
            const next = cur.channels.map((ch, i) => (i === channelIndex ? ({ ...ch, online } as Channel) : ch))
            return { byId: { ...s.byId, [dvrId]: { ...cur, channels: next } } }
          }, false, "dvr/setChannelOnline"),

        setActiveDvr: (dvrId) => set({ activeDvrId: dvrId }, false, "ui/setActiveDvr"),

        removeDvr: (dvrId) =>
          set((s) => {
            const n = { ...s.byId }
            delete n[dvrId]
            return { byId: n }
          }, false, "dvr/remove"),

        clearAll: () => set({ byId: {}, activeDvrId: undefined }, false, "dvr/clearAll"),

        touch: (dvrId) =>
          set((s) => {
            const cur = s.byId[dvrId]
            if (!cur) return s
            return { byId: { ...s.byId, [dvrId]: { ...cur, lastOverviewAt: Date.now() } } }
          }, false, "dvr/touch"),

        getResolvedCounts: (dvrId) => {
          const cur = get().byId[dvrId]
          if (!cur) return { total: 0 }
          const fromBackend = cur.counts ? cur.counts.analog + cur.counts.ip : undefined
          const fromChannels = Array.isArray(cur.channels) ? cur.channels.length : undefined
          const total = fromBackend ?? fromChannels ?? cur.declaredChannels ?? 0
          return { total, analog: cur.counts?.analog, ip: cur.counts?.ip }
        },

        setStatus: (dvrId, status) =>
          set((s) => {
            const cur = s.byId[dvrId] || ({ id: dvrId, name: dvrId, vendor: "intelbras", status: "unknown" } as DvrEntry)
            return { byId: { ...s.byId, [dvrId]: { ...cur, vendor: cur.vendor ?? "intelbras", status, lastStatusAt: Date.now() } } }
          }, false, "dvr/setStatus"),
      }),
      {
        name: "dvr-session-cache",
        storage: chosenStorage,
        version: 1,
        onRehydrateStorage: () => (state) => {
          if (!state) return
          const now = Date.now()
          const byId = state.byId || {}
          for (const [id, entry] of Object.entries(byId)) {
            const ts = entry?.lastOverviewAt ?? 0
            if (ts && now - ts > PERSIST_TTL_MS) delete byId[id]
          }
          state.byId = byId
        },
      }
    ),
    { name: "VisuALL:DVRStore" }
  )
)

if (isBrowser && process.env.NODE_ENV === "development") {
  ;(window as any).dvrStore = useDvrStore
}
