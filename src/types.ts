export type Vendor = "intelbras" | "hikvision" | "jfl";

export interface DVRAuth {
  ip: string;
  httpPort: number;
  username: string;
  password: string;
  ddns?: string;
  https?: boolean;
}

export interface DVR {
  id: string;
  name: string;
  vendor: Vendor;
  auth: DVRAuth;
  channels: number;
}

export interface Client {
  id: string;
  name: string;
  dvrs: DVR[];
}

export interface TimeResult {
  ok: boolean;
  value?: string;
  raw?: string;
}

export interface HDDInfo {
  ok: boolean;
  summary?: { totalBytes?: number; freeBytes?: number; disks?: Array<{ name?: string; capacityBytes?: number; state?: string }> };
  raw?: any;
}
