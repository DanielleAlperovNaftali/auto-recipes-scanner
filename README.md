# 🍽️ מתכונים שלי — Hebrew Recipe Scanner

A family recipe app with secure login. Each family member logs in with their own username and password.

---

## 🏗️ Architecture

```
Browser  →  Netlify Functions (serverless)  →  Supabase DB
                     ↓ (server-side only)
               Anthropic Claude API
```

- API keys **never touch the browser** — they live in Supabase, fetched only by Netlify Functions
- Each user has their own login, and optionally their own API key
- Recipes are saved per-device in localStorage (private to each browser)

---

## 🚀 Deploy Steps

### Step 1 — Set up Supabase (free)
1. Go to [supabase.com](https://supabase.com) → "New project" (free tier)
2. Open **SQL Editor** and paste + run the contents of `SETUP.sql`
3. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **service_role** key (under "Project API keys" — use the secret one, NOT anon)

### Step 2 — Add users
In the Supabase SQL Editor:
1. Go to [bcrypt-generator.com](https://bcrypt-generator.com) to hash each password (rounds = 10)
2. Run the INSERT statements in `SETUP.sql` with real usernames, hashed passwords, and API keys

### Step 3 — Deploy to Netlify
1. Go to [netlify.com](https://netlify.com) → "Add new site" → "Import from Git"
   - OR: push this project to a GitHub repo and connect it
   - OR: use Netlify CLI: `npm install -g netlify-cli && netlify deploy`
2. Set **build command**: `npm run build` and **publish directory**: `dist`

### Step 4 — Set environment variables in Netlify
Go to: Site → Site configuration → Environment variables → Add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `JWT_SECRET` | Any long random string (e.g. generate at passwordsgenerator.net, 40+ chars) |

### Step 5 — Redeploy
After setting env vars, trigger a redeploy. Your site is live!

---

## 👨‍👩‍👧 Adding a new family member

1. Go to [bcrypt-generator.com](https://bcrypt-generator.com) and hash their password
2. Run in Supabase SQL Editor:
```sql
INSERT INTO users (username, password_hash, api_key) VALUES
  ('newmember', '$2a$10$THE_HASH', 'sk-ant-THEIR_OR_SHARED_API_KEY');
```

## 🔑 Changing someone's password

1. Hash the new password at bcrypt-generator.com
2. Run:
```sql
UPDATE users SET password_hash = '$2a$10$NEW_HASH' WHERE username = 'mom';
```

---

## 💰 Cost

- **Supabase**: Free tier (500MB, more than enough)
- **Netlify**: Free tier (125k function calls/month, more than enough)
- **Anthropic API**: ~$0.01–0.02 per recipe scan

---

## 📁 Project Structure

```
my-recipes/
├── netlify/
│   └── functions/
│       ├── login.js          ← Validates username/password, returns JWT
│       ├── claude-proxy.js   ← Forwards Claude API calls (keeps API key server-side)
│       ├── me.js             ← Validates session token
│       └── package.json      ← Dependencies for functions
├── src/
│   ├── App.jsx               ← Main React app
│   ├── main.jsx
│   └── index.css
├── SETUP.sql                 ← Run this in Supabase
├── netlify.toml
└── package.json
```
# auto-recipes-scanner
# auto-recipes-scanner
# auto-recipes-scanner
# auto-recipes-scanner
# auto-recipes-scanner
