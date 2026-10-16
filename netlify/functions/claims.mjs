import { getStore } from "@netlify/blobs";

const TTL = 60 * 60 * 1000; // claims auto-release after 1 hour

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Stored value: {"c": clientId, "n": name, "t": claimedAtMs}. Old plain-string claims count as expired.
const parse = (raw) => {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o && o.c && o.t ? o : null;
  } catch { return null; }
};
const alive = (o) => o && Date.now() - o.t < TTL;

const cleanName = (h) => {
  try { return decodeURIComponent(h || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 30); }
  catch { return ""; }
};

export default async (req) => {
  const key = Netlify.env.get("ACCESS_KEY") || "";
  if (key && req.headers.get("x-key") !== key) return json({}, 401);
  const client = req.headers.get("x-client") || "";
  if (!client) return json({}, 400);

  const store = getStore("claims");

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const out = {};
    await Promise.all(blobs.map(async (b) => {
      const o = parse(await store.get(b.key));
      if (alive(o)) out[b.key] = { mine: o.c === client, name: o.n || "", left: TTL - (Date.now() - o.t) };
      else await store.delete(b.key);
    }));
    return json(out);
  }

  if (req.method === "POST") {
    let d;
    try { d = await req.json(); } catch { return json({}, 400); }
    const id = String(d.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) return json({}, 400);

    const raw = await store.get(id);
    const cur = parse(raw);

    if (d.action === "claim") {
      if (alive(cur)) return json({}, 409);
      if (raw) await store.delete(id); // expired or legacy entry
      const name = cleanName(req.headers.get("x-name")) || "Someone";
      const res = await store.set(id, JSON.stringify({ c: client, n: name, t: Date.now() }), { onlyIfNew: true });
      return res.modified ? json({}) : json({}, 409);
    }
    if (d.action === "release") {
      if (alive(cur) && cur.c !== client) return json({}, 403);
      if (raw) await store.delete(id);
      return json({});
    }
    return json({}, 400);
  }
  return json({}, 405);
};

export const config = { path: "/api/claims" };
