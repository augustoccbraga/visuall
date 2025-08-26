import { useEffect, useMemo, useState } from "react";
import type { DVR } from "../types";
import { snapshotUrl } from "../lib/dvr";

type Cell = { ch: number; src: string; ok: boolean | null; nonce: number };

export default function CameraGrid({ dvr }: { dvr: DVR }) {
  const [cells, setCells] = useState<Cell[]>([]);
  useEffect(() => {
    const list = Array.from({ length: dvr.channels }).map((_, i) => {
      const ch = i + 1;
      const src = snapshotUrl(dvr, ch);
      return { ch, src, ok: null, nonce: Date.now() };
    });
    setCells(list);
  }, [dvr]);

  const grid = useMemo(() => {
    const size = 16;
    const arr = Array.from({ length: size }).map((_, i) => cells[i] || null);
    return arr;
  }, [cells]);

  const refreshOne = (idx: number) => {
    setCells(s => s.map((c, i) => i === idx ? { ...c, nonce: Date.now(), ok: null } : c));
  };

  return (
    <div className="flex-1 bg-zinc-200">
      <div className="grid grid-cols-4 grid-rows-4 gap-px bg-zinc-400 h-[calc(100vh-140px)]">
        {grid.map((cell, i) => (
          <div key={i} className="bg-zinc-200 relative">
            {cell ? (
              <>
                <img
                  src={`${cell.src}${cell.src.includes("?") ? "&" : "?"}t=${cell.nonce}`}
                  onLoad={() => setCells(s => s.map((c, j) => j === i ? { ...c, ok: true } : c))}
                  onError={() => setCells(s => s.map((c, j) => j === i ? { ...c, ok: false } : c))}
                  className="w-full h-full object-cover"
                  alt={`CAM ${cell.ch}`}
                />
                <div className="absolute top-1 left-1 text-[11px] px-1.5 py-0.5 rounded bg-black/60 text-white">CAM {cell.ch}</div>
                <button onClick={() => refreshOne(i)} className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-white/70 hover:bg-white">↻</button>
                <span className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${cell.ok === null ? "bg-yellow-400" : cell.ok ? "bg-green-500" : "bg-red-500"}`}></span>
              </>
            ) : (
              <div className="w-full h-full bg-zinc-300"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
