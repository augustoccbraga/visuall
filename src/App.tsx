import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import CameraGrid from "./components/CameraGrid";
import BottomPanel from "./components/BottomPanel";
import EmptyState from "./components/EmptyState";
import type { Client, DVR } from "./types";
import { fetchDvrTime, fetchHddInfo, dvrWebUrl } from "./lib/dvr";

function formatBytes(b?: number) {
  if (!b || b <= 0) return "?";
  const tb = b / (1024 ** 4);
  if (tb >= 1) return `${tb.toFixed(2)} TB`;
  return `${(b / (1024 ** 3)).toFixed(2)} GB`;
}

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<{ client?: Client; dvr?: DVR }>({});
  const [timeText, setTimeText] = useState("-");
  const [hddLines, setHddLines] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}clients.json`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => setClients(Array.isArray(j.clients) ? j.clients : Array.isArray(j.clientes) ? j.clientes : []))
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    setTimeText("-");
    setHddLines([]);
  }, [selected.dvr?.id]);

  const onSelect = async (client: Client, dvr: DVR) => {
    setSelected({ client, dvr });
    setTimeText("-");
    setHddLines([]);
    const [tr, hr] = await Promise.allSettled([fetchDvrTime(dvr), fetchHddInfo(dvr)]);
    if (tr.status === "fulfilled" && tr.value.ok && tr.value.value) setTimeText(tr.value.value);
    if (hr.status === "fulfilled" && hr.value.ok && hr.value.summary) {
      const s = hr.value.summary;
      const lines: string[] = [];
      if (s.disks && s.disks.length) {
        s.disks.forEach((d, i) => lines.push(`HD ${i + 1}: ${formatBytes(d.capacityBytes)}${d.state ? ` (${d.state})` : ""}`));
      } else {
        if (s.totalBytes) lines.push(`Total: ${formatBytes(s.totalBytes)}`);
        if (s.freeBytes) lines.push(`Livre: ${formatBytes(s.freeBytes)}`);
      }
      setHddLines(lines);
    }
  };

  const onOpen = () => {
    if (!selected.dvr) return;
    window.open(dvrWebUrl(selected.dvr), "_blank", "noopener,noreferrer");
  };

  const selectedClientName = useMemo(() => selected.client?.name || "-", [selected.client?.id]);

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      <Sidebar
        clients={clients}
        selected={{ clientId: selected.client?.id, dvrId: selected.dvr?.id }}
        onSelect={onSelect}
      />
      <div className="flex-1 flex flex-col">
        {selected.dvr ? <CameraGrid dvr={selected.dvr} /> : <EmptyState />}
        <BottomPanel
          clientName={selectedClientName}
          dvr={selected.dvr}
          timeText={timeText}
          hddLines={hddLines}
          onTime={() => {}}
          onHdd={() => {}}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}
