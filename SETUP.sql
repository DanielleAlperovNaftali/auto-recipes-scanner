-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- 1. Create the users table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  api_key       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Disable public access (only server-side service key can read this table)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- No public policies — only the service role key (used in Netlify Functions) can access it

-- 3. Add your family members
-- Generate password hashes at: https://bcrypt-generator.com (use rounds = 10)
-- Then paste them here:

INSERT INTO users (username, password_hash, api_key) VALUES
  ('mom',   '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH', 'sk-ant-YOUR_API_KEY_HERE'),
  ('dad',   '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH', 'sk-ant-YOUR_API_KEY_HERE'),
  ('sarah', '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH', 'sk-ant-YOUR_API_KEY_HERE');

-- Each user can have their own api_key, or you can share one key across all users.
