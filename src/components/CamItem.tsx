import { VideoCameraIcon, WifiIcon } from "@heroicons/react/20/solid"
import { useDvrStore } from "../state/useDvrStore"

type Props = { dvrId: string; index: number; name?: string | null; online?: boolean | null }

export default function CamItem({ dvrId, index, name, online }: Props) {
  const zeroIndex = Math.max(0, (index ?? 1) - 1)
  const entry = useDvrStore(s => s.byId[dvrId])
  const isIp = !!entry?.indices?.ip?.includes(zeroIndex)
  const isAnalog = !!entry?.indices?.analog?.includes(zeroIndex)
  const Icon = isIp ? WifiIcon : VideoCameraIcon
  const explicit = online ?? entry?.channels?.[zeroIndex]?.online ?? null
  const color = explicit == null ? "text-green-500" : explicit ? "text-green-500" : "text-red-500"

  return (
    <div className="flex items-center justify-between text-zinc-300 p-2 border-b pl-4 text-xs">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${color}`} />
        <span>{name || `CAM ${index}`}</span>
      </div>
    </div>
  )
}
