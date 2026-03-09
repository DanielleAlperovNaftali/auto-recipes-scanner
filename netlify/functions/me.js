const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "No token" }) };
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: payload.username }) };
  } catch {
    return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid token" }) };
  }
};
