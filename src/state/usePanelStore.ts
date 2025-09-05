import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { useDvrStore } from "./useDvrStore"
import type { DVR } from "../types"

type PanelEntry = {
  timeText?: string
  hddLines?: string[]
  ipOffline?: number
  lastAt?: number
}

type PanelStore = {
  byId: Record<string, PanelEntry>
  setPanel: (dvrId: string, patch: Partial<PanelEntry>) => void
  refreshFromDvrStore: (dvrId: string) => void
  fetchPanelIfStale: (dvrId: string, force?: boolean) => Promise<void>
}

const API_BASE = ((import.meta as any).env?.VITE_API_BASE || "/api").replace(/\/+$/,"")
const PANEL_TTL_MS = 60 * 1000

function webUrlFromDvr(dvr?: DVR | null) {
  const host = dvr?.auth?.ddns || dvr?.auth?.ip
  const port = dvr?.auth?.httpPort
  if (!host || !port) return null
  return `http://${host}:${port}`
}

export const usePanelStore = create<PanelStore>()(
  devtools(
    (set, get) => ({
      byId: {},

      setPanel: (dvrId, patch) =>
        set(s => ({ byId: { ...s.byId, [dvrId]: { ...(s.byId[dvrId] || {}), ...patch } } }), false, "panel/set"),

      refreshFromDvrStore: (dvrId) => {
        const s = useDvrStore.getState()
        const e = s.byId[dvrId]
        const ipTotal = e?.counts?.ip ?? 0
        const ipOn = e?.indices?.ip?.length ?? 0
        const ipOffline = Math.max(ipTotal - ipOn, 0)
        get().setPanel(dvrId, { ipOffline })
      },

      fetchPanelIfStale: async (dvrId, force = false) => {
        const s = useDvrStore.getState()
        const e = s.byId[dvrId]
        if (!e) return
        const now = Date.now()
        const cur = get().byId[dvrId]
        if (!force && cur?.lastAt && now - cur.lastAt < PANEL_TTL_MS) return

        const baseUrl = webUrlFromDvr(e as any)
        if (!baseUrl || !e.auth) {
          get().setPanel(dvrId, { lastAt: now })
          return
        }

        try {
          const [ro, rt] = await Promise.all([
            fetch(`${API_BASE}/dvrs/${dvrId}/overview`),
            fetch(`${API_BASE}/dvrs/${dvrId}/current-time`)
          ])

          const jo = ro.ok ? await ro.json() : {}
          const jt = rt.ok ? await rt.json() : {}

          get().setPanel(dvrId, {
            timeText: jt?.timeText || jt?.iso || "-",
            hddLines: [],
            lastAt: now,
          })
        } catch {
          get().setPanel(dvrId, { lastAt: now })
        } finally {
          get().refreshFromDvrStore(dvrId)
        }
      },
    }),
    { name: "VisuALL:PanelStore" }
  )
)
