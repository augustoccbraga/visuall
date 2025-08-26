import { useState } from "react";
import type { Client, DVR } from "../types";

type Props = {
  clients: Client[];
  selected: { clientId?: string; dvrId?: string };
  onSelect: (client: Client, dvr: DVR) => void;
};

export default function Sidebar({ clients, selected, onSelect }: Props) {
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});
  const [openDvrs, setOpenDvrs] = useState<Record<string, boolean>>({});

  return (
    <aside className="w-56 bg-zinc-900 text-zinc-100 h-screen flex flex-col">
      <div className="h-12 px-4 flex items-center gap-2 border-b border-zinc-800">
        <div className="w-2 h-2 bg-cyan-300 rounded-full"></div>
        <div className="font-semibold tracking-wider">VISUALL</div>
      </div>
      <div className="flex-1 overflow-auto text-sm">
        {clients.map(c => {
          const co = !!openClients[c.id];
          return (
            <div key={c.id} className="border-b border-zinc-800">
              <button onClick={() => setOpenClients(s => ({ ...s, [c.id]: !co }))} className="w-full px-3 py-2 flex items-center justify-between hover:bg-zinc-800">
                <span>{c.name.replace(/^Cliente\s*/i,"") || c.name}</span>
                <span className="text-zinc-400">{co ? "▴" : "▾"}</span>
              </button>
              {co && (
                <div className="pb-2">
                  {c.dvrs.map(d => {
                    const dof = !!openDvrs[d.id];
                    const active = selected.clientId === c.id && selected.dvrId === d.id;
                    return (
                      <div key={d.id}>
                        <div className={`px-4 py-2 flex items-center justify-between ${active ? "bg-zinc-800" : "hover:bg-zinc-800"}`}>
                          <button onClick={() => onSelect(c, d)} className="flex-1 text-left">↳ {d.name}</button>
                          <button onClick={() => setOpenDvrs(s => ({ ...s, [d.id]: !dof }))} className="text-zinc-400 ml-2">{dof ? "▴" : "▾"}</button>
                        </div>
                        {dof && (
                          <div className="pl-6 pr-2 pb-2 space-y-1">
                            {Array.from({ length: d.channels }).map((_, i) => (
                              <div key={i} className="flex items-center justify-between text-zinc-300">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                                  <span>CAM {i + 1}</span>
                                </div>
                                <span className="text-xs text-zinc-400">●</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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
