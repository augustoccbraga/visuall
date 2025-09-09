import { ArrowPathIcon, WrenchIcon } from "@heroicons/react/20/solid"

type Row = { name: string; sizeText: string; daysText?: string }
type Props = {
  items?: Row[]
  onRefresh: () => void
  onVerify: () => void
}

export default function ShowHdd({ items, onRefresh, onVerify }: Props) {
  const rows = (items || []).slice(0, 2)
  return (
    <div className="rounded-xl bg-zinc-800 px-3 py-2 w-64 h-full">
      <table className="w-full text-sm mt-1">
        <thead>
          <tr className="text-zinc-400 text-xs">
            <th className="text-left font-normal py-1">HD</th>
            <th className="text-left font-normal py-1">TB</th>
            <th className="text-left font-normal py-1">Período (dias)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((r, i) => (
              <tr key={i} className="text-zinc-200">
                <td className="py-1">{r.name}</td>
                <td className="py-1">{r.sizeText || "-"}</td>
                <td className="py-1">{r.daysText || "-"}</td>
              </tr>
            ))
          ) : (
            <tr className="text-zinc-400">
              <td className="py-1">-</td>
              <td className="py-1">-</td>
              <td className="py-1">-</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={onRefresh} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700">
          <ArrowPathIcon className="w-5 h-5" />
        </button>
        <button onClick={onVerify} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700">
          <WrenchIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
