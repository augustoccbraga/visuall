import { useEffect, useState } from "react";
import type { Client, DVR } from "../types";
import DvrItem from "./DvrItem";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/20/solid";

type Props = {
  clients?: Client[];
  selected: { clientId?: string; dvrId?: string };
  onSelect: (client: Client, dvr: DVR) => void;
};

export default function Sidebar({ clients: clientsProp = [], selected, onSelect }: Props) {
  const [clients, setClients] = useState<Client[]>(clientsProp);
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});
  const [openDvrs, setOpenDvrs] = useState<Record<string, boolean>>({});
  const [snap, setSnap] = useState<Record<string, { status: string; counts?: { analog?: number; ip?: number } }>>({});

  useEffect(() => {
  let cancel = false;
  async function boot() {
      try {
        const r = await fetch("/api/summary");
        if (r.ok) {
          const j = await r.json();
          if (cancel) return;
          const normalized: Client[] = (j.clients || []).map((c: any) => ({
            id: c.id, name: c.name, dvrs: c.dvrs
          }));
          setClients(normalized);
          return;
        }
      } catch {}
      try {
        const r2 = await fetch(`${import.meta.env.BASE_URL}clients.json`, { cache: "no-store" });
        const j2 = await r2.json();
        if (cancel) return;
        const arr = Array.isArray(j2.clients) ? j2.clients : Array.isArray(j2.clientes) ? j2.clientes : [];
        setClients(arr);
      } catch {
        if (!cancel) setClients([]);
      }
    }
    boot();
    return () => { cancel = true; };
  }, []);


  return (
    <aside className="w-56 bg-zinc-900 text-zinc-100 h-screen flex flex-col">
      <div className="h-12 px-4 flex items-center gap-2 border-b border-zinc-800">
        <div className="w-2 h-2 bg-cyan-300 rounded-full" />
        <div className="font-semibold tracking-wider">VISUALL</div>
      </div>
      <div className="flex-1 overflow-auto text-sm">
        {clients.map(c => {
          const open = !!openClients[c.id];
          return (
            <div key={c.id} className="border-b border-zinc-800">
              <button
                onClick={() => setOpenClients(s => ({ ...s, [c.id]: !open }))}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-zinc-800"
              >
                <span>{c.name.replace(/^Cliente\s*/i, "") || c.name}</span>
                {open ? <ChevronUpIcon className="w-4 h-4 text-zinc-400" /> : <ChevronDownIcon className="w-4 h-4 text-zinc-400" />}
              </button>

              {open && (
                <div className="pb-2">
                  {c.dvrs.map(d => {
                    const active = selected.clientId === c.id && selected.dvrId === d.id;
                    const isOpen = !!openDvrs[d.id];
                    return (
                      <DvrItem
                        key={d.id}
                        client={c}
                        dvr={d}
                        active={active}
                        isOpen={isOpen}
                        onToggle={() => setOpenDvrs(s => ({ ...s, [d.id]: !isOpen }))}
                        onSelect={onSelect}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
