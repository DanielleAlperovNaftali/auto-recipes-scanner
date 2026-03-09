const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { username, password } = JSON.parse(event.body || "{}");
  if (!username || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing credentials" }) };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Look up user
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, password_hash, api_key")
    .eq("username", username.toLowerCase().trim())
    .single();

  if (error || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid username or password" }) };
  }

  // Check password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid username or password" }) };
  }

  // Issue JWT (contains user id, NOT api key)
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, username: user.username }),
  };
};
