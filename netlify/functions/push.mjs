import { getStore } from "@netlify/blobs";
import { getVapid } from "../lib/push.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  try {
    const key = Netlify.env.get("ACCESS_KEY") || "";
    if (key && req.headers.get("x-key") !== key) return json({}, 401);

    if (req.method === "GET") {
      const k = await getVapid();
      return json({ publicKey: k.publicKey });
    }

    const client = req.headers.get("x-client") || "";
    if (!/^[\w-]{1,80}$/.test(client)) return json({}, 400);
    if (req.method !== "POST") return json({}, 405);

    let d;
    try { d = await req.json(); } catch { return json({}, 400); }
    const subs = getStore({ name: "subs", consistency: "strong" });

    if (d.action === "subscribe") {
      const sub = d.subscription;
      if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://") || !sub.keys) return json({}, 400);
      await subs.setJSON(client, { sub, at: Date.now() });
      return json({});
    }
    if (d.action === "unsubscribe") {
      await subs.delete(client);
      return json({});
    }
    return json({}, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};

export const config = { path: "/api/push" };
