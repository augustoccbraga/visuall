// src/components/TopPanel.tsx
import { useEffect, useMemo } from "react"
import type { DVR } from "../types"
import { useDvrStore } from "../state/useDvrStore"
import { usePanelStore } from "../state/usePanelStore"
import ShowDate from "./ShowDate"
import ShowHdd from "./ShowHdd"
import ShowInfo from "./ShowInfo"
import { ArrowPathIcon } from "@heroicons/react/20/solid"


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
    let isoCandidate = v.includes("T") ? v : v.replace(" ", "T")
    if (/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(v)) {
      const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(v)!
      isoCandidate = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`
    }
    const d = new Date(isoCandidate)
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
    <div className="bg-zinc-900 text-zinc-100 flex self-end border-b">
      <div className="divide-y  border-white">
        <div className="text-lg font-semibold p-2 flex gap-2">
          {clientName || "-"} - {dvr?.name || "-"} 
          <button onClick={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700">
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="">
          <div className="flex flex-wrap items-center divide-x">
            <ShowDate
              value={panel?.timeText}
              ok={timeOk}
              onAdjust={doNtpSync}
              onRefresh={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }}
            />
            <ShowHdd
              items={hddItems}
              onVerify={onHdd}
              ok={true}
              onRefresh={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }}
            />
            <ShowInfo
              counts={counts}
              panel={panel}
              dvr={!!dvr}
              onOpen={onOpen}
              onRefresh={() => { if (activeDvrId) fetchPanelIfStale(activeDvrId, true).catch(() => {}) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
