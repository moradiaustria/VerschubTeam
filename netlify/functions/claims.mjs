import { getStore } from "@netlify/blobs";

const TTL_MS = (Number(Netlify.env.get("CLAIM_TTL_HOURS")) || 8) * 3600 * 1000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};

// Returns the claim object, or null if missing/expired (expired ones are deleted).
async function readClaim(store, id) {
  const raw = await store.get(id);
  if (!raw) return null;
  let c = null;
  try { c = JSON.parse(raw); } catch {}
  if (!c || typeof c !== "object" || !c.client || !c.at || Date.now() - c.at > TTL_MS) {
    await store.delete(id);
    return null;
  }
  return c;
}

async function handle(req) {
  const key = Netlify.env.get("ACCESS_KEY") || "";
  if (key && req.headers.get("x-key") !== key) return json({}, 401);
  const client = req.headers.get("x-client") || "";
  if (!client) return json({}, 400);
  const adminKey = Netlify.env.get("ADMIN_KEY") || "";
  const isAdmin = !!adminKey && req.headers.get("x-admin") === adminKey;

  const store = getStore({ name: "claims", consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const out = {};
    await Promise.all(blobs.map(async (b) => {
      const c = await readClaim(store, b.key);
      if (c) out[b.key] = { mine: c.client === client, name: c.name || "Someone", until: c.at + TTL_MS };
    }));
    return json(out);
  }

  if (req.method === "POST") {
    let d;
    try { d = await req.json(); } catch { return json({}, 400); }
    if (d.action === "admin") return isAdmin ? json({}) : json({}, 403);
    const id = String(d.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) return json({}, 400);

    if (d.action === "claim") {
      const cur = await readClaim(store, id);
      if (cur) return cur.client === client ? json({}) : json({}, 409);
      const name = String(d.name || "").trim().slice(0, 30) || "Someone";
      await store.set(id, JSON.stringify({ client, name, at: Date.now() }));
      return json({});
    }
    if (d.action === "release") {
      const cur = await readClaim(store, id);
      if (!cur) return json({});
      if (cur.client !== client && !isAdmin) return json({}, 403);
      await store.delete(id);
      return json({});
    }
    return json({}, 400);
  }
  return json({}, 405);
}

export const config = { path: "/api/claims" };
