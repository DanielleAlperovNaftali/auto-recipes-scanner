const jwt = require("jsonwebtoken");

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

  // Users are stored as environment variables:
  // USER_DANIELLE=password123:sk-ant-apikey...
  // USER_MOM=password456:sk-ant-apikey...
  // Format: USERNAME (uppercased) → "password:apikey"
  const envKey = "USER_" + username.toUpperCase().trim();
  const envVal = process.env[envKey];

  if (!envVal) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid username or password" }) };
  }

  const [storedPassword, apiKey] = envVal.split(":");
  if (!storedPassword || password !== storedPassword) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid username or password" }) };
  }

  const token = jwt.sign(
    { username: username.toLowerCase().trim(), apiKey },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, username: username.toLowerCase().trim() }),
  };
};
