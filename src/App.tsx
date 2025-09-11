import { useEffect, useMemo, useState } from "react"
import Sidebar from "./components/Sidebar"
import TopPanel from "./components/TopPanel"
import EmptyState from "./components/EmptyState"
import CameraGrid from "./components/CameraGrid"
import type { Client, DVR } from "./types"
import { useDvrStore } from "./state/useDvrStore"

function webUrl(dvr?: DVR) {
  if (!dvr?.auth) return null
  const host = dvr.auth.ddns || dvr.auth.ip
  if (!host || !dvr.auth.httpPort) return null
  return `http://${host}:${dvr.auth.httpPort}`
}

const API_BASE = ((import.meta as any).env?.VITE_API_BASE || "/api").replace(/\/+$/,"")

export default function App() {
  const [clients, setClients] = useState<Client[]>([])
  const byId = useDvrStore(s => s.byId)
  const activeDvrId = useDvrStore(s => s.activeDvrId)
  const setActiveDvr = useDvrStore(s => s.setActiveDvr)
  const bootstrapFromClients = useDvrStore(s => s.bootstrapFromClients)
  const fetchOverview = useDvrStore(s => s.fetchOverview)
  const fetchChannelsIfStale = useDvrStore(s => s.fetchChannelsIfStale)
  const getResolvedCounts = useDvrStore(s => s.getResolvedCounts)

  useEffect(() => {
    fetch(`${API_BASE}/summary`).then(r => r.json()).then(j => {
      const arr: Client[] = Array.isArray(j?.clients) ? j.clients : []
      setClients(arr)
      bootstrapFromClients(arr)
      if (!activeDvrId && arr[0]?.dvrs?.[0]) setActiveDvr(arr[0].dvrs[0].id)
    }).catch(() => {})
  }, [])

  const selected = useMemo(() => {
    let c: Client | undefined, d: DVR | undefined
    for (const cli of clients) {
      const dv = (cli.dvrs || []).find(x => x.id === activeDvrId)
      if (dv) { c = cli; d = dv; break }
    }
    return { client: c, dvr: d }
  }, [clients, activeDvrId])

  useEffect(() => {
    if (!selected.dvr) return
    fetchOverview(selected.dvr).catch(() => {})
    fetchChannelsIfStale(selected.dvr).catch(() => {})
  }, [selected.dvr?.id])

  const storeEntry = activeDvrId ? byId[activeDvrId] : undefined
  const counts = activeDvrId ? getResolvedCounts(activeDvrId) : undefined
  const dvrForGrid = selected.dvr ? { ...selected.dvr, channels: storeEntry?.channels } : undefined

  return (
    <div className="h-screen w-screen overflow-hidden grid grid-cols-[15%_auto] grid-rows-[15%_auto] bg-zinc-900">
      <div className="p-12 flex items-center place-content-center border-b border-r border-white">
        <img src="/LOGO-white.svg" alt="VISUALL" className="h-16" />
      </div>
      <TopPanel
        clientName={selected.client?.name}
        dvr={dvrForGrid}
        timeText="-"
        hddLines={[]}
        analogCount={counts?.analog}
        ipCount={counts?.ip}
        onTime={() => {}}
        onHdd={() => {}}
        onOpen={() => {
          const u = webUrl(selected.dvr)
          if (u) window.open(u, "_blank", "noopener,noreferrer")
        }}
      />
      <Sidebar
        clients={clients}
        selected={{ clientId: selected.client?.id, dvrId: selected.dvr?.id }}
        onSelect={(dvr) => setActiveDvr(dvr?.id)}
      />
      {selected.dvr ? <CameraGrid dvr={dvrForGrid} /> : <EmptyState />}
    </div>
  )
}
