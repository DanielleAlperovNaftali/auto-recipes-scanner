const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) return json(401, { error: "Unauthorized" });

  let payload;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    payload = JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"));
  } catch { return json(401, { error: "Invalid token" }); }

  if (!payload.exp || Date.now() > payload.exp) return json(401, { error: "Session expired" });

  const username = payload.username;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (event.httpMethod === "GET") {
    const { data, error } = await supabase.from("user_data").select("data").eq("username", username).single();
    if (error || !data) return json(200, { recipes: [], customCats: [] });
    return json(200, data.data || { recipes: [], customCats: [] });
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const payload_data = { recipes: body.recipes || [], customCats: body.customCats || [] };
    await supabase.from("user_data").upsert({ username, data: payload_data }, { onConflict: "username" });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
};

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
