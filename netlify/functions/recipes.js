// GET  /?username=xxx  → load recipes + custom cats
// POST with {action:"save", recipes:[], customCats:[]} → save

const fs = require("fs");
const path = require("path");

// Store data in /tmp (ephemeral but fine for Netlify — we persist to a JSON file per user)
// For real persistence across deploys, you'd use a DB. But /tmp works per-instance.
// Better: encode data in the token and use Supabase storage. For now we use a simple approach:
// store in environment-keyed base, which means we need actual storage.
// → Use Netlify Blobs (built-in KV, no extra setup needed)

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };

  let payload;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    payload = JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"));
  } catch {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid token" }) };
  }

  if (!payload.exp || Date.now() > payload.exp) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Session expired" }) };
  }

  const username = payload.username;
  const store = getStore("recipes");

  if (event.httpMethod === "GET") {
    try {
      const data = await store.get(username, { type: "json" });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || { recipes: [], customCats: [] }),
      };
    } catch {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipes: [], customCats: [] }) };
    }
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    await store.setJSON(username, { recipes: body.recipes || [], customCats: body.customCats || [] });
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
};
