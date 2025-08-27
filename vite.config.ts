import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash, randomBytes } from "node:crypto";

function md5(s: string) {
  return createHash("md5").update(s).digest("hex");
}
function parseDigest(auth: string) {
  const out: Record<string, string> = {};
  const h = auth.replace(/^Digest\s+/i, "");
  h.split(",").forEach((p) => {
    const m = p.match(/\s*([^=]+)=("([^"]+)"|([^,]+))/);
    if (m) out[m[1].trim()] = (m[3] || m[4] || "").trim();
  });
  return out;
}
async function fetchAuto(method: string, url: string, user: string, pass: string, body?: string, ct?: string, asBinary?: boolean) {
  const init0: any = { method, headers: {}, body: body ?? undefined };
  if (body && ct) init0.headers["Content-Type"] = ct;
  let r = await fetch(url, init0);
  if (r.status !== 401) {
    if (asBinary) {
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: r.status, ok: r.ok, body: buf, type: r.headers.get("content-type") || "application/octet-stream" };
    }
    const text = await r.text();
    return { status: r.status, ok: r.ok, text, type: r.headers.get("content-type") || "text/plain" };
  }
  const hdr = r.headers.get("www-authenticate") || "";
  if (/digest/i.test(hdr)) {
    const p = parseDigest(hdr);
    const realm = p.realm || "";
    const nonce = p.nonce || "";
    const qop = (p.qop || "auth").split(",")[0].trim();
    const uri = new URL(url).pathname + (new URL(url).search || "");
    const nc = "00000001";
    const cnonce = randomBytes(8).toString("hex");
    const ha1 = md5(`${user}:${realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
    const authz =
      `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", ` +
      (qop ? `qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : "");
    const init: any = { method, headers: { Authorization: authz }, body: body ?? undefined };
    if (body && ct) init.headers["Content-Type"] = ct;
    r = await fetch(url, init);
    if (asBinary) {
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: r.status, ok: r.ok, body: buf, type: r.headers.get("content-type") || "application/octet-stream" };
    }
    const text = await r.text();
    return { status: r.status, ok: r.ok, text, type: r.headers.get("content-type") || "text/plain" };
  } else {
    const basic = Buffer.from(`${user}:${pass}`).toString("base64");
    const init: any = { method, headers: { Authorization: `Basic ${basic}` }, body: body ?? undefined };
    if (body && ct) init.headers["Content-Type"] = ct;
    r = await fetch(url, init);
    if (asBinary) {
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: r.status, ok: r.ok, body: buf, type: r.headers.get("content-type") || "application/octet-stream" };
    }
    const text = await r.text();
    return { status: r.status, ok: r.ok, text, type: r.headers.get("content-type") || "text/plain" };
  }
}

function dvrProxy() {
  return {
    name: "dvr-proxy",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url) return next();
        const u = new URL(req.url, "http://localhost");
        if (!u.pathname.startsWith("/__dvr/")) return next();
        const vendor = u.searchParams.get("vendor") || "";
        const scheme = u.searchParams.get("scheme") || "http";
        const host = u.searchParams.get("host") || "";
        const port = u.searchParams.get("port") || "";
        const user = u.searchParams.get("user") || "";
        const pass = u.searchParams.get("pass") || "";
        const base = port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`;

        try {
          if (u.pathname === "/__dvr/time") {
            let out: any;
            if (vendor === "intelbras") {
              const p1 = `${base}/cgi-bin/global.cgi?action=getCurrentTime`;
              const p2 = `${base}/cgi-bin/magicBox.cgi?action=getLocalTime`;
              out = await fetchAuto("GET", p1, user, pass, undefined, undefined, false);
              if (!out.ok || !out.text) out = await fetchAuto("GET", p2, user, pass, undefined, undefined, false);
            } else {
              out = await fetchAuto("GET", `${base}/ISAPI/System/time/localTime`, user, pass, undefined, undefined, false);
            }
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.statusCode = out.status || 500;
            res.setHeader("Content-Type", out.type || "text/plain");
            res.end(out.text || "");
            return;
          }

          if (u.pathname === "/__dvr/hdd") {
            let out: any;
            if (vendor === "intelbras") {
              const body = JSON.stringify({ volume: "PhysicalVolume" });
              out = await fetchAuto("POST", `${base}/cgi-bin/api/StorageDeviceManager/getDeviceInfos`, user, pass, body, "application/json", false);
            } else {
              out = await fetchAuto("GET", `${base}/ISAPI/ContentMgmt/Storage/hardDiskInfo`, user, pass, undefined, undefined, false);
            }
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.statusCode = out.status || 500;
            res.setHeader("Content-Type", out.type || "text/plain");
            res.end(out.text || "");
            return;
          }

          if (u.pathname === "/__dvr/snapshot") {
            const ch = Number(u.searchParams.get("ch") || "1");
            const path =
              vendor === "intelbras"
                ? `/cgi-bin/snapshot.cgi?channel=${ch}`
                : `/ISAPI/Streaming/channels/${ch * 100 + 1}/picture`;
            const out = await fetchAuto("GET", `${base}${path}`, user, pass, undefined, undefined, true);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.statusCode = out.status || 500;
            res.setHeader("Content-Type", out.type || "image/jpeg");
            res.end(out.body || Buffer.alloc(0));
            return;
          }

          next();
        } catch (e: any) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.statusCode = 500;
          res.end(String(e?.message || e));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dvrProxy()],
});
