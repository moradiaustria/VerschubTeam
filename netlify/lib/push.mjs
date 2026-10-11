import webpush from "web-push";
import { getStore } from "@netlify/blobs";

// VAPID keys are generated once and kept in Blobs, so no manual setup is needed.
export async function getVapid() {
  const st = getStore({ name: "config", consistency: "strong" });
  let k = await st.get("vapid", { type: "json" });
  if (!k) {
    k = webpush.generateVAPIDKeys();
    await st.setJSON("vapid", k);
  }
  return k;
}

export async function notifyAll(excludeClient, payload) {
  const k = await getVapid();
  webpush.setVapidDetails("mailto:info@mostafamoradi.at", k.publicKey, k.privateKey);
  const subs = getStore({ name: "subs", consistency: "strong" });
  const { blobs } = await subs.list();
  await Promise.all(blobs.map(async (b) => {
    if (b.key === excludeClient) return;
    const rec = await subs.get(b.key, { type: "json" });
    if (!rec || !rec.sub) return;
    try {
      await webpush.sendNotification(rec.sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await subs.delete(b.key);
    }
  }));
}
