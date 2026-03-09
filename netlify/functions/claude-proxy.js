const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Verify JWT
  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid or expired session" }) };
  }

  // Fetch user's API key from DB (never sent to browser)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: user, error } = await supabase
    .from("users")
    .select("api_key")
    .eq("id", payload.sub)
    .single();

  if (error || !user?.api_key) {
    return { statusCode: 403, body: JSON.stringify({ error: "No API key configured for this user" }) };
  }

  // Forward request to Anthropic
  const body = JSON.parse(event.body || "{}");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": user.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return {
    statusCode: response.status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
};
