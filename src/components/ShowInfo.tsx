// src/components/ShowInfo.tsx
import { CheckCircleIcon, GlobeAltIcon, VideoCameraIcon, XCircleIcon } from "@heroicons/react/20/solid"

type Props = {
  counts?: { analog?: number; ip?: number }
  panel?: { ipOnline?: number; ipOffline?: number }
  dvr?: boolean
  onOpen: () => void
  onRefresh: () => void
}

function Item({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="flex items-center rounded-3xl gap-2 border">
      <div className="pl-3 py-2">{icon}</div>
      <span className="w-[0.1px] bg-white h-full"/>
      <div className="flex-1 pr-3 py-2">
        <div className="text-xs text-zinc-400">{label}</div>
        <div className="text-lg font-semibold leading-tight">{value}</div>
      </div>
    </div>
  )
}

export default function ShowInfo({ counts, panel, dvr, onOpen, onRefresh }: Props) {
  const analog = counts?.analog ?? "-"
  const ip: number | any = counts?.ip ?? "-"
  const ipOffline: number | any  = panel?.ipOffline ?? "-"
  const ipOnline = (ip - ipOffline)

  return (
    <div className="flex flex-row">
        <div className="p-2 flex flex-col gap-2">
            <div className="flex flex-wrap gap-4">
                <Item
                icon={<VideoCameraIcon className="w-5 h-5 text-zinc-100" />}
                label="Câmeras analógicas"
                value={analog}
                />
                <Item
                icon={<GlobeAltIcon className="w-5 h-5 text-zinc-100" />}
                label="Câmeras IPs"
                value={ip}
                />
                <Item
                icon={<CheckCircleIcon className="w-5 h-5 text-emerald-500" />}
                label="IPs online"
                value={ipOnline}
                accent="bg-emerald-950/50"
                />
                <Item
                icon={<XCircleIcon className="w-5 h-5 text-red-500" />}
                label="IPs offline"
                value={ipOffline}
                accent="bg-red-950/50"
                />
            </div>
        </div>
        <div className="flex flex-col p-2">
            <button
            onClick={onOpen}
            disabled={!dvr}
            className="px-3 py-2 rounded-full bg-zinc-100 text-zinc-900 text-xs hover:opacity-90 disabled:opacity-60"
            >
                ABRIR INTERFACE WEB
            </button>
        </div>
    </div>
  )
}
