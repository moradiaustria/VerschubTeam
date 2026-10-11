
import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};

async function handle(req) {
  const key = Netlify.env.get("ACCESS_KEY") || "";
  if (key && req.headers.get("x-key") !== key) return json({}, 401);
  const client = req.headers.get("x-client") || "";
  if (!client) return json({}, 400);

  const store = getStore("claims");

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const out = {};
    await Promise.all(blobs.map(async (b) => {
      const owner = await store.get(b.key);
      if (owner) out[b.key] = { mine: owner === client };
    }));
    return json(out);
  }

  if (req.method === "POST") {
    let d;
    try { d = await req.json(); } catch { return json({}, 400); }
    const id = String(d.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) return json({}, 400);

    if (d.action === "claim") {
      const cur = await store.get(id);
      if (cur) return cur === client ? json({}) : json({}, 409);
      await store.set(id, client);
      return json({});
    }
    if (d.action === "release") {
      if ((await store.get(id)) !== client) return json({}, 403);
      await store.delete(id);
      return json({});
    }
    return json({}, 400);
  }
  return json({}, 405);
}

export const config = { path: "/api/claims" };
