import { useEffect, useMemo } from "react"
import type { Client, DVR } from "../types"
import { ChevronUpIcon, ChevronDownIcon, VideoCameraIcon } from "@heroicons/react/20/solid"
import CamItem from "./CamItem"
import { useDvrStore } from "../state/useDvrStore"

type Props = {
  client: Client
  dvr: DVR
  active: boolean
  isOpen: boolean
  onToggle: () => void
  onSelect: (client: Client, dvr: DVR) => void
}

function vendorBadge(v: DVR["vendor"]) {
  if (v === "intelbras") return { label: "i", cls: "bg-emerald-500 text-black" }
  if (v === "hikvision") return { label: "h", cls: "bg-red-500 text-white" }
  if (v === "jfl") return { label: "j", cls: "bg-yellow-400 text-black" }
  return { label: "?", cls: "bg-zinc-500 text-white" }
}
function statusDotCls(s: "online" | "offline" | "unknown" | undefined) {
  if (s === "online") return "bg-green-500"
  if (s === "offline") return "bg-red-500"
  return "bg-yellow-400"
}

export default function DvrItem({ client, dvr, active, isOpen, onToggle, onSelect }: Props) {
  const badge = vendorBadge(dvr.vendor)
  const entry = useDvrStore(s => s.byId[dvr.id])
  const setActiveDvr = useDvrStore(s => s.setActiveDvr)
  const fetchOverview = useDvrStore(s => s.fetchOverview)
  const fetchChannelsIfStale = useDvrStore(s => s.fetchChannelsIfStale)
  const getResolvedCounts = useDvrStore(s => s.getResolvedCounts)

  useEffect(() => {
    if (!entry?.lastOverviewAt || !entry?.indices) fetchOverview(dvr).catch(() => {})
  }, [dvr.id, !!entry?.indices])

  const counts = getResolvedCounts(dvr.id)
  const status = entry?.status ?? "unknown"

  const onlineFromIndices = useMemo(() => {
    const a = entry?.indices?.analog ?? []
    const b = entry?.indices?.ip ?? []
    return new Set<number>([...a, ...b]).size
  }, [entry?.indices])

  const hasOnlineFlags = Array.isArray(entry?.channels) && entry!.channels!.some(c => c.online !== null && c.online !== undefined)
  const onlineFromFlags = useMemo(() => {
    if (!hasOnlineFlags || !Array.isArray(entry?.channels)) return 0
    return entry!.channels!.filter(c => c.online === true).length
  }, [hasOnlineFlags, entry?.channels])

  const hasIndices = !!entry?.indices
  const totalForList =
    Array.isArray(entry?.channels) && entry!.channels!.length > 0
      ? entry!.channels!.length
      : counts.total

  const breakdownTitle =
    entry?.counts ? `IP: ${entry.counts.ip} | Analógico: ${entry.counts.analog}` : undefined

  const handleSelect = () => {
    onSelect(client, dvr)
    setActiveDvr(dvr.id)
  }
  const handleToggle = () => {
    onToggle()
    if (!isOpen) {
      setActiveDvr(dvr.id)
      fetchChannelsIfStale(dvr).catch(() => {})
      fetchOverview(dvr).catch(() => {})
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelect() }}
        className={`w-full px-4 py-2 flex items-center gap-2 cursor-pointer ${active ? "bg-zinc-800" : "hover:bg-zinc-800"}`}
      >
        <span className={`w-2 h-2 rounded-full ${statusDotCls(status)}`} />
        <span className="flex-1 text-left">{entry?.name ?? dvr.name}</span>
        <span className="inline-flex items-center gap-2" title={breakdownTitle}>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-300">
            <VideoCameraIcon className="w-4 h-4" />
            {hasOnlineFlags ? onlineFromFlags : hasIndices ? onlineFromIndices : "—"}/{counts.total}
          </span>
          <span className={`text-[10px] leading-none px-1.5 py-0.5 rounded ${badge.cls} uppercase font-semibold`}>
            {badge.label}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggle() }}
            className="p-1.5 rounded hover:bg-zinc-700"
            aria-label={isOpen ? "Recolher" : "Expandir"}
          >
            {isOpen ? <ChevronUpIcon className="w-5 h-5 text-zinc-300" /> : <ChevronDownIcon className="w-5 h-5 text-zinc-300" />}
          </button>
        </span>
      </div>

      {isOpen && (
        <div>
          {Array.isArray(entry?.channels) && entry!.channels!.length > 0
            ? entry!.channels!.map((ch, idx) => (
                <CamItem
                  key={`${dvr.id}-ch-${ch.index ?? idx}`}
                  dvrId={dvr.id}
                  index={(ch.index ?? 0) + 1}
                  name={ch.name ?? `CAM ${(ch.index ?? 0) + 1}`}
                  online={ch.online ?? null}
                />
              ))
            : Array.from({ length: totalForList }).map((_, i) => (
                <CamItem key={i} dvrId={dvr.id} index={i + 1} name={`CAM ${i + 1}`} online={null} />
              ))}
        </div>
      )}
    </div>
  )
}
