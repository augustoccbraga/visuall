import { useEffect, useMemo } from "react"
import type { DVR } from "../types"
import { useDvrStore } from "../state/useDvrStore"
import { usePanelStore } from "../state/usePanelStore"
import ShowDate from "./ShowDate"

const API_BASE = ((import.meta as any).env?.VITE_API_BASE || "/api").replace(/\/+$/,"")

type Props = {
  clientName?: string
  dvr?: DVR
  timeText?: string
  hddLines?: string[]
  analogCount?: number
  ipCount?: number
  onTime: () => void
  onHdd: () => void
  onOpen: () => void
}

export default function TopPanel({ clientName, dvr, onTime, onHdd, onOpen }: Props) {
  const activeDvrId = useDvrStore(s => s.activeDvrId)
  const getResolvedCounts = useDvrStore(s => s.getResolvedCounts)
  const counts = activeDvrId ? getResolvedCounts(activeDvrId) : undefined
  const panel = usePanelStore(s => (activeDvrId ? s.byId[activeDvrId] : undefined))
  const fetchPanelIfStale = usePanelStore(s => s.fetchPanelIfStale)
  const refreshFromDvrStore = usePanelStore(s => s.refreshFromDvrStore)

  useEffect(() => {
    if (!activeDvrId) return
    refreshFromDvrStore(activeDvrId)
    fetchPanelIfStale(activeDvrId).catch(() => {})
  }, [activeDvrId])

  const doNtpSync = async () => {
    if (!activeDvrId) return
    try {
      await fetch(`${API_BASE}/dvrs/${activeDvrId}/ntp-sync`, { method: "GET" })
    } finally {
      fetchPanelIfStale(activeDvrId, true).catch(() => {})
    }
  }

  const timeOk = useMemo(() => {
    const v = panel?.timeText
    if (!v || v === "-") return false
    const s = v.includes("T") ? v : v.replace(" ", "T")
    const d = new Date(s)
    if (isNaN(d.getTime())) return false
    const diff = Math.abs(Date.now() - d.getTime())
    return diff <= 30_000
  }, [panel?.timeText])

  return (
    <div className="h-full bg-zinc-900 text-zinc-100 border-zinc-700">
      <div className="mx-auto px-2 py-2">
        <div className="text-lg font-semibold">{clientName || "-"} - {dvr?.name || "-"}</div>
        <div className="p-2">
          <div className="flex flex-wrap items-center gap-3">
            <ShowDate
              value={panel?.timeText}
              ok={timeOk}
              onAdjust={doNtpSync}
              onRefresh={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }}
            />

            <div className="text-sm">
              <div className="text-zinc-400">HDDs</div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-zinc-800 whitespace-pre">{panel?.hddLines?.length ? panel.hddLines.join("\n") : "-"}</div>
                <button onClick={onHdd} className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600">VERIFICAR</button>
                <button onClick={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }} className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600">↻</button>
              </div>
            </div>

            <div className="text-sm">
              <div className="text-zinc-400">Câmeras analógicas</div>
              <div className="px-2 py-1 rounded bg-zinc-800">{counts?.analog ?? "-"}</div>
            </div>

            <div className="text-sm">
              <div className="text-zinc-400">Câmeras IPs</div>
              <div className="px-2 py-1 rounded bg-zinc-800">{counts?.ip ?? "-"}</div>
            </div>

            <div className="text-sm">
              <div className="text-zinc-400">Câmeras IPs offline</div>
              <div className="px-2 py-1 rounded bg-zinc-800">{panel?.ipOffline ?? "-"}</div>
            </div>

            <div className="ml-auto">
              <button onClick={onOpen} disabled={!dvr} className="px-3 py-2 rounded bg-zinc-100 text-zinc-900 text-xs hover:opacity-90 disabled:opacity-60">ABRIR INTERFACE WEB</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
