exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

  const { username, password } = body;
  if (!username || !password) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Missing credentials" }) };
  }

  const envKey = "USER_" + username.toUpperCase().trim();
  const envVal = process.env[envKey];

  if (!envVal) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid username or password" }) };
  }

  const colonIndex = envVal.indexOf(":");
  const storedPassword = envVal.substring(0, colonIndex);
  const apiKey = envVal.substring(colonIndex + 1);

  if (password !== storedPassword) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid username or password" }) };
  }

  // Simple token: base64(username:apiKey:timestamp) — verified server-side by re-reading env
  const tokenData = Buffer.from(JSON.stringify({
    username: username.toLowerCase().trim(),
    apiKey,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  })).toString("base64");

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenData, username: username.toLowerCase().trim() }),
  };
};
