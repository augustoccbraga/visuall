// types.ts
export type Vendor = "intelbras" | "hikvision" | "jfl";
export type ChannelType = "analog" | "ip" | "unknown";
export type DvrStatus = "online" | "offline" | "unknown";

export interface Channel {
  index: number;
  name?: string | null;
  type: ChannelType;
  enabled?: boolean;
  online?: boolean | null;
  meta?: Record<string, unknown>;
}

export interface DVRAuth {
  ip: string;
  httpPort: number;
  username: string;
  password: string;
  ddns?: string;
  https?: boolean;
}

export interface DvrCounts { analog: number; ip: number; }
export interface DvrIndices { analog: number[]; ip: number[]; }

export interface DVR {
  id: string;
  name: string;
  vendor: Vendor;
  auth: DVRAuth;
  channels?: Channel[];
  declaredChannels?: number;

  // novos: preenchidos pelo backend
  status?: DvrStatus;
  counts?: DvrCounts;
  indices?: DvrIndices;
  lastOverviewAt?: string; // opcional
}

export interface Client { id: string; name: string; dvrs: DVR[]; }

export interface TimeResult { ok: boolean; value?: string; raw?: string; }

export interface HDDInfo {
  ok: boolean;
  summary?: { totalBytes?: number; freeBytes?: number; disks?: Array<{ name?: string; capacityBytes?: number; state?: string }> };
  raw?: unknown;
}
