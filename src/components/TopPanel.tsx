import { useEffect, useMemo } from "react"
import type { DVR } from "../types"
import { useDvrStore } from "../state/useDvrStore"
import { usePanelStore } from "../state/usePanelStore"
import ShowDate from "./ShowDate"
import ShowHdd from "./ShowHdd"

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

  const hddItems = useMemo(() => {
    const lines = Array.isArray(panel?.hddLines) ? panel!.hddLines! : []
    const parseNum = (x?: string) => {
      if (!x) return NaN
      const y = x.replace(",", ".")
      return parseFloat(y)
    }
    const extract = (s: string, key: RegExp) => {
      const m = s.match(key)
      if (!m) return null
      const val = parseNum(m[1])
      const unit = String(m[2] || "TB").toUpperCase()
      const tb = unit === "GB" ? val / 1024 : val
      return isNaN(tb) ? null : tb
    }
    const items = lines.slice(0, 2).map((line, i) => {
      const total =
        extract(line, /total\s*[:=]?\s*([\d.,]+)\s*(tb|gb)/i) ??
        extract(line, /([\d.,]+)\s*(tb|gb)\s*total/i)
      const usedPrimary =
        extract(line, /(?:usado|Used)\s*[:=]?\s*([\d.,]+)\s*(tb|gb)/i) ??
        extract(line, /([\d.,]+)\s*(tb|gb)\s*(?:usado|used)/i)
      const freeFallback =
        extract(line, /(?:livre|Free)\s*[:=]?\s*([\d.,]+)\s*(tb|gb)/i) ??
        extract(line, /([\d.,]+)\s*(tb|gb)\s*(?:livre|free)/i)
      let sizeText = "-"
      if (total != null) {
        const used = usedPrimary != null ? usedPrimary : (freeFallback != null ? Math.max(0, total - freeFallback) : null)
        if (used != null) sizeText = `${used.toFixed(2)}/${total.toFixed(2)} TB`
      }
      return { name: `HD ${i + 1}`, sizeText, daysText: "" }
    })
    if (items.length === 0) return []
    return items
  }, [panel?.hddLines])

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
            <ShowHdd
              items={hddItems}
              onVerify={onHdd}
              onRefresh={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }}
            />
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
