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

async function fetchWithAutoAuth(method: string, url: string, user: string, pass: string, body?: string, contentType?: string) {
  const init0: any = { method, headers: {}, body: body ?? undefined };
  if (body && contentType) init0.headers["Content-Type"] = contentType;
  let r = await fetch(url, init0);
  if (r.status !== 401) {
    const text = await r.text();
    return { status: r.status, ok: r.ok, text };
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
    if (body && contentType) init.headers["Content-Type"] = contentType;
    r = await fetch(url, init);
    const text = await r.text();
    return { status: r.status, ok: r.ok, text };
  } else {
    const basic = Buffer.from(`${user}:${pass}`).toString("base64");
    const init: any = { method, headers: { Authorization: `Basic ${basic}` }, body: body ?? undefined };
    if (body && contentType) init.headers["Content-Type"] = contentType;
    r = await fetch(url, init);
    const text = await r.text();
    return { status: r.status, ok: r.ok, text };
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

        try {
          const vendor = u.searchParams.get("vendor") || "";
          const scheme = u.searchParams.get("scheme") || "http";
          const host = u.searchParams.get("host") || "";
          const port = u.searchParams.get("port") || "";
          const user = u.searchParams.get("user") || "";
          const pass = u.searchParams.get("pass") || "";
          const base = port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`;

          let out = { status: 502, ok: false, text: "" };

          if (u.pathname === "/__dvr/time") {
            if (vendor === "intelbras") {
              const p1 = `${base}/cgi-bin/global.cgi?action=getCurrentTime`;
              const p2 = `${base}/cgi-bin/magicBox.cgi?action=getLocalTime`;
              out = await fetchWithAutoAuth("GET", p1, user, pass);
              if (!out.ok || !out.text) out = await fetchWithAutoAuth("GET", p2, user, pass);
            } else {
              const p = `${base}/ISAPI/System/time/localTime`;
              out = await fetchWithAutoAuth("GET", p, user, pass);
            }
          }

          if (u.pathname === "/__dvr/hdd") {
            if (vendor === "intelbras") {
              const p = `${base}/cgi-bin/api/StorageDeviceManager/getDeviceInfos`;
              const body = JSON.stringify({ volume: "PhysicalVolume" });
              out = await fetchWithAutoAuth("POST", p, user, pass, body, "application/json");
            } else {
              const p = `${base}/ISAPI/ContentMgmt/Storage/hardDiskInfo`;
              out = await fetchWithAutoAuth("GET", p, user, pass);
            }
          }

          res.setHeader("Access-Control-Allow-Origin", "*");
          res.statusCode = out.status || 500;
          res.end(out.text || "");
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
