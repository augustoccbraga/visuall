import type { DVR } from "../types";

type Props = {
  clientName?: string;
  dvr?: DVR;
  timeText: string;
  hddLines: string[];
  onTime: () => void;
  onHdd: () => void;
  onOpen: () => void;
};

export default function BottomPanel({ clientName, dvr, timeText, hddLines, onTime, onHdd, onOpen }: Props) {
  return (
    <div className="h-[120px] bg-zinc-800 text-zinc-100 border-t border-zinc-700">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="text-lg font-semibold">{clientName || "-"} - {dvr?.name || "-"}</div>
        <div className="mt-3 bg-zinc-900 rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm">
              <div className="text-zinc-400">Data/hora</div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-zinc-800">{timeText}</span>
                <button onClick={onTime} className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600">AJUSTAR</button>
              </div>
            </div>
            <div className="text-sm">
              <div className="text-zinc-400">HDDs</div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-zinc-800 whitespace-pre">{hddLines.length ? hddLines.join("\n") : "-"}</div>
                <button onClick={onHdd} className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600">VERIFICAR</button>
              </div>
            </div>
            <div className="ml-auto">
              <button onClick={onOpen} disabled={!dvr} className="px-3 py-2 rounded bg-zinc-100 text-zinc-900 text-xs hover:opacity-90 disabled:opacity-60">ABRIR INTERFACE WEB</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
