const jwt = require("jsonwebtoken");

// Simple endpoint to validate a session token
exports.handler = async (event) => {
  const token = (event.headers.authorization || "").replace("Bearer ", "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "No token" }) };
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return { statusCode: 200, body: JSON.stringify({ username: payload.username }) };
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
  }
};
