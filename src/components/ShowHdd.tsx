import { CheckIcon, WrenchIcon, XMarkIcon } from "@heroicons/react/20/solid"

type Row = { name: string; sizeText: string; daysText?: string }
type Props = {
  items?: Row[]
  ok: boolean
  onRefresh: () => void
  onVerify: () => void
}

export default function ShowHdd({ items, ok, onVerify }: Props) {
  const rows = (items || []).slice(0, 2)
  return (
    <div className="p-2 flex flex-row items-center gap-2">
      <div className="text-xs text-zinc-400">HD</div>
      {rows.length > 0 ? (
        rows.map((r, i) => (
          <div key={i} className="text-zinc-200 flex flex-row gap-4">
            <div className="py-1">{r.name}</div>
            <div className="py-1">{r.sizeText || "-"}</div>
            <div className="py-1">{r.daysText || "-"}</div>
          </div>
        ))
      ) : (
        <div className="text-zinc-200 flex flex-row gap-4">
          <div className="py-1">-</div>
          <div className="py-1">-</div>
          <div className="py-1">-</div>
        </div>
      )}
    <div className="flex items-center gap-2">
      <div className="ml-auto">
          {ok ? (
            <CheckIcon className="w-6 h-6 text-emerald-500" />
          ) : (
            <XMarkIcon className="w-6 h-6 text-red-500" />
          )}
        </div>
      <button onClick={onVerify} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700">
        <WrenchIcon className="w-5 h-5" />
      </button>
    </div>
  </div>
  )
}
