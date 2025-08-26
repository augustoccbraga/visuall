import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import CameraGrid from "./components/CameraGrid";
import BottomPanel from "./components/BottomPanel";
import type { Client, DVR } from "./types";
import { dvrWebUrl, fetchDvrTime, fetchHddInfo } from "./lib/dvr";

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<{ client?: Client; dvr?: DVR }>({});
  const [timeText, setTimeText] = useState("-");
  const [hddLines, setHddLines] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}clients.json`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => setClients(Array.isArray(j.clients) ? j.clients : Array.isArray(j.clientes) ? j.clientes : []));
  }, []);

  useEffect(() => {
    if (clients[0]?.dvrs?.[0] && !selected.dvr) setSelected({ client: clients[0], dvr: clients[0].dvrs[0] });
  }, [clients]);

  useEffect(() => {
    setTimeText("-");
    setHddLines([]);
  }, [selected.dvr?.id]);

  const onSelect = (client: Client, dvr: DVR) => setSelected({ client, dvr });

  const onTime = async () => {
    if (!selected.dvr) return;
    console.log("[onTime] start", { dvrId: selected.dvr.id, vendor: selected.dvr.vendor });
    const r = await fetchDvrTime(selected.dvr);
    console.log("[onTime] result", r);
    setTimeText(r.ok && r.value ? r.value : "-");
  };


  const onHdd = async () => {
    if (!selected.dvr) return;
    const r = await fetchHddInfo(selected.dvr);
    if (!r.ok || !r.summary) { setHddLines([]); return; }
    const lines: string[] = [];
    if (r.summary.disks && r.summary.disks.length) {
      r.summary.disks.forEach((d, i) => {
        const cap = d.capacityBytes || 0;
        const val = cap / (1024 ** 4) >= 1 ? (cap / (1024 ** 4)).toFixed(2) + " TB" : (cap / (1024 ** 3)).toFixed(2) + " GB";
        lines.push(`HD ${i + 1}: ${cap ? val : "?"}${d.state ? ` (${d.state})` : ""}`);
      });
    } else {
      const cap = r.summary.totalBytes || 0;
      const free = r.summary.freeBytes || 0;
      if (cap) lines.push(`Total: ${cap / (1024 ** 4) >= 1 ? (cap / (1024 ** 4)).toFixed(2) + " TB" : (cap / (1024 ** 3)).toFixed(2) + " GB"}`);
      if (free) lines.push(`Livre: ${free / (1024 ** 4) >= 1 ? (free / (1024 ** 4)).toFixed(2) + " TB" : (free / (1024 ** 3)).toFixed(2) + " GB"}`);
    }
    setHddLines(lines);
  };

  const onOpen = () => {
    if (!selected.dvr) return;
    window.open(dvrWebUrl(selected.dvr), "_blank", "noopener,noreferrer");
  };

  const selectedClientName = useMemo(() => selected.client?.name || "-", [selected.client?.id]);

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      <Sidebar clients={clients} selected={{ clientId: selected.client?.id, dvrId: selected.dvr?.id }} onSelect={onSelect} />
      <div className="flex-1 flex flex-col">
        {selected.dvr ? <CameraGrid dvr={selected.dvr} /> : <div className="flex-1 bg-zinc-200"></div>}
        <BottomPanel clientName={selectedClientName} dvr={selected.dvr} timeText={timeText} hddLines={hddLines} onTime={onTime} onHdd={onHdd} onOpen={onOpen} />
      </div>
    </div>
  );
}
