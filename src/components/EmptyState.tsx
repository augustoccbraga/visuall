import { EyeSlashIcon } from "@heroicons/react/24/outline";

export default function EmptyState() {
  return (
    <div className="flex-1 grid place-items-center bg-zinc-200">
      <div className="flex flex-col items-center gap-3 text-zinc-500">
        <EyeSlashIcon className="w-12 h-12" />
        <p className="text-sm">Selecione um DVR para visualizar.</p>
      </div>
    </div>
  );
}
