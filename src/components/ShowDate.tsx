// src/components/ShowDate.tsx
import { ArrowPathIcon, CheckIcon, WrenchIcon, XMarkIcon } from "@heroicons/react/20/solid"

type Props = {
  value?: string
  ok: boolean
  onAdjust: () => void
  onRefresh: () => void
}

function splitValue(v?: string) {
  if (!v || v === "-") return { date: "-", time: "-" }
  const s = String(v).replace("T", " ").trim()
  const parts = s.split(/\s+/)
  if (parts.length >= 2) return { date: parts[0], time: parts[1] }
  return { date: s, time: "-" }
}

export default function ShowDate({ value, ok, onAdjust, onRefresh }: Props) {
  const { date, time } = splitValue(value)
  return (
    <div className="rounded-xl bg-zinc-800 px-3 py-2 w-48">
      <div className="text-xs text-zinc-400">DATA/HORA</div>
      <div className="text-base font-semibold">{date}</div>
      <div className="text-2xl font-bold leading-tight">{time}</div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={onRefresh} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700">
          <ArrowPathIcon className="w-5 h-5" />
        </button>
        <button onClick={onAdjust} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700">
          <WrenchIcon className="w-5 h-5" />
        </button>
        <div className="ml-auto">
          {ok ? (
            <CheckIcon className="w-6 h-6 text-emerald-500" />
          ) : (
            <XMarkIcon className="w-6 h-6 text-red-500" />
          )}
        </div>
      </div>
    </div>
  )
}
