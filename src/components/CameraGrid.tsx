import { useEffect, useMemo, useState } from "react"
import { useDvrStore } from "../state/useDvrStore"
import type { DVR } from "../types"
import { FaceFrownIcon } from "@heroicons/react/20/solid"

const API_BASE = ((import.meta as any).env?.VITE_API_BASE || "/api").replace(/\/+$/,"")

export default function CameraGrid({ dvr }: { dvr?: DVR }) {
  const activeDvrId = useDvrStore(s => s.activeDvrId)
  const entry = useDvrStore(s => (activeDvrId ? s.byId[activeDvrId] : undefined))
  const getResolvedCounts = useDvrStore(s => s.getResolvedCounts)

  const [seed, setSeed] = useState(0)
  const [wipeKey, setWipeKey] = useState("")

  useEffect(() => {
    const k = `${activeDvrId || "none"}:${Date.now()}`
    setWipeKey(k)
    setSeed(Date.now())
  }, [activeDvrId])

  const indicesUnion = useMemo(() => {
    const a = entry?.indices?.analog || []
    const b = entry?.indices?.ip || []
    const ids = Array.from(new Set([...a, ...b])).sort((x,y)=>x-y)
    if (ids.length) return ids
    const fallbackTotal = activeDvrId ? getResolvedCounts(activeDvrId).total : (dvr?.declaredChannels ?? 0)
    return Array.from({ length: fallbackTotal }, (_, i) => i)
  }, [entry?.indices, activeDvrId, dvr?.declaredChannels])

  const onlineSet = useMemo(() => new Set(indicesUnion), [indicesUnion])

  const totalChannels = indicesUnion.length
  const side = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, totalChannels))))
  const totalTiles = side * side

  return (
    <div key={wipeKey} className="flex-1">
      <div
        className="grid gap-px h-[calc(100vh-15%)]"
        style={{ gridTemplateColumns: `repeat(${side}, minmax(0,1fr))`, gridTemplateRows: `repeat(${side}, minmax(0,1fr))` }}
      >
        {Array.from({ length: totalTiles }, (_, i) => {
          const within = i < totalChannels
          const chanIndex = within ? indicesUnion[i] : i
          const isOnline = within && onlineSet.has(chanIndex)
          const label = chanIndex + 1
          const snapUrl = isOnline && activeDvrId ? `${API_BASE}/dvrs/${encodeURIComponent(activeDvrId)}/snapshot/${chanIndex}?t=${seed}` : null
          const dot = !within ? "bg-zinc-400" : isOnline ? "bg-green-500" : "bg-red-500"

          return (
            <div key={i} className="bg-zinc-200 relative">
              {snapUrl ? (
                <img
                  src={snapUrl}
                  className="w-full h-full object-fit bg-black"
                  draggable={false}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2" }}
                />
              ) : within ? (
                <div className="w-full h-full bg-black flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <FaceFrownIcon className="w-6 h-6 text-red-500" />
                    <span className="text-red-500 text-sm font-semibold">Câmera offline</span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full bg-zinc-300" />
              )}
              <span className={`absolute top-1 right-1 w-[10px] h-[10px] rounded-full border ${dot}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
