import { useState, useCallback, useRef, useEffect } from "react";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const BUILTIN_CATEGORIES = [
  { id: "breakfast", label: "ארוחת בוקר",    emoji: "🌅", color: "#F59E0B", custom: false },
  { id: "lunch",     label: "ארוחת צהריים",  emoji: "☀️", color: "#10B981", custom: false },
  { id: "dinner",    label: "ארוחת ערב",     emoji: "🌙", color: "#6366F1", custom: false },
  { id: "meat",      label: "בשרי",          emoji: "🥩", color: "#EF4444", custom: false },
  { id: "dairy",     label: "חלבי",          emoji: "🧀", color: "#3B82F6", custom: false },
  { id: "pareve",    label: "פרווה",         emoji: "🥗", color: "#14B8A6", custom: false },
  { id: "cakes",     label: "עוגות ומתוקים", emoji: "🎂", color: "#EC4899", custom: false },
  { id: "soup",      label: "מרקים",         emoji: "🍲", color: "#F97316", custom: false },
  { id: "salad",     label: "סלטים",         emoji: "🥙", color: "#84CC16", custom: false },
  { id: "side",      label: "תוספות",        emoji: "🍚", color: "#8B5CF6", custom: false },
  { id: "snack",     label: "חטיפים",        emoji: "🥨", color: "#06B6D4", custom: false },
  { id: "other",     label: "אחר",           emoji: "📋", color: "#9CA3AF", custom: false },
];

const PALETTE = ["#F59E0B","#10B981","#6366F1","#EF4444","#3B82F6","#14B8A6","#EC4899","#F97316","#84CC16","#8B5CF6","#06B6D4","#9CA3AF","#E11D48","#7C3AED","#059669","#D97706","#0EA5E9","#65A30D","#DC2626"];
const EMOJIS  = ["🍕","🍜","🥘","🫕","🥗","🥩","🍗","🐟","🥚","🧆","🥐","🍞","🧇","🥞","🍰","🧁","🍮","🍦","🫙","🥫","🥦","🧅","🫚","🧄","🌶️","🍅","🥕","🥜","🌽","🫛"];

const STORAGE_KEY    = "hebrew-recipes-v1";
const CUSTOM_CAT_KEY = "hebrew-recipes-custom-cats";
const SESSION_KEY    = "hebrew-recipes-session";

const DEMO_RECIPE = {
  id: "demo-1", title: "עוגת שוקולד קלאסית", categories: ["cakes","dairy"],
  ingredients: ["2 כוסות קמח","1.5 כוסות סוכר","3/4 כוס אבקת קקאו","2 כפיות אבקת אפייה","1 כפית סודה לשתייה","1 כפית מלח","2 ביצים גדולות","1 כוס חלב","1/2 כוס שמן צמחי","1 כפית תמצית וניל","1 כוס מים רותחים"],
  instructions: ["מחממים תנור ל-175 מעלות ומשמנים תבנית עגולה בקוטר 23 ס״מ.","מערבבים בקערה גדולה את כל החומרים היבשים: קמח, סוכר, קקאו, אבקת אפייה, סודה ומלח.","מוסיפים ביצים, חלב, שמן ווניל ומערבבים במהירות בינונית למשך 2 דקות.","מוסיפים מים רותחים ומערבבים. הבלילה תהיה דלילה – זה תקין.","יוצקים לתבנית ואופים 30-35 דקות, עד שקיסם יוצא נקי.","מצננים 10 דקות בתבנית, ואז הופכים לרשת לצינון מלא."],
  prepTime: "15 דקות", cookTime: "35 דקות", servings: "12 מנות",
  notes: "ניתן להוסיף 1/2 כוס שוקולד צ'יפס לבלילה לטעם עשיר יותר.",
  imageBase64: null, imageType: null, createdAt: new Date().toISOString(), isDemo: true,
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const ls = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)    => { try { localStorage.removeItem(k); } catch {} },
};

function migrateRecipe(r) {
  if (r.categories) return r;
  return { ...r, categories: r.category ? [r.category] : ["other"], category: undefined };
}

function loadSavedRecipes() {
  const saved = ls.get(STORAGE_KEY, []).map(migrateRecipe);
  return saved.length > 0 ? saved : [DEMO_RECIPE];
}

// API calls — all go through our Netlify proxy (token in header, api key never in browser)
async function apiCall(endpoint, body, token) {
  const res = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res;
}

async function claudeViaProxy(body, token) {
  const res = await apiCall("claude-proxy", body, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Error ${res.status}`);
  }
  return res.json();
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function extractAndCategorize(base64Image, mediaType, token, allCategories) {
  const catList = allCategories.map(c => `${c.id}: ${c.label}`).join(", ");
  const data = await claudeViaProxy({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: `You are a Hebrew recipe extractor. Extract from this screenshot:
1. Recipe title in Hebrew
2. ALL matching categories from: ${catList} (a recipe can belong to multiple)
3. Ingredients in Hebrew
4. Instructions in Hebrew
5. Prep/cook time and servings if visible
Respond ONLY with valid JSON:
{"title":"...","categories":["id1","id2"],"ingredients":["..."],"instructions":["..."],"prepTime":"X דקות or null","cookTime":"X דקות or null","servings":"X מנות or null","notes":"... or null"}`,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
      { type: "text", text: "חלץ את המתכון מהתמונה הזו" },
    ]}],
  }, token);

  const text  = data.content?.map(b => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  const allIds = allCategories.map(c => c.id);
  parsed.categories = (parsed.categories || []).filter(id => allIds.includes(id));
  if (parsed.categories.length === 0) parsed.categories = ["other"];
  return parsed;
}

// ─────────────────────────────────────────────
// UI Primitives
// ─────────────────────────────────────────────
function DeleteBtn({ onClick }) {
  const [h, sH] = useState(false);
  return (
    <button onClick={onClick} title="מחק שורה" onMouseEnter={() => sH(true)} onMouseLeave={() => sH(false)}
      style={{ background: h ? "rgba(239,68,68,0.15)" : "transparent", border: "1px solid", borderColor: h ? "#EF4444" : "rgba(239,68,68,0.4)", borderRadius: "6px", cursor: "pointer", color: h ? "#EF4444" : "rgba(239,68,68,0.55)", fontSize: "0.78rem", fontWeight: 700, padding: "1px 6px", flexShrink: 0, lineHeight: 1.7, transition: "all 0.15s", minWidth: "22px", textAlign: "center" }}>✕</button>
  );
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "linear-gradient(135deg, #1a1740, #2a2460)", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.12)", padding: "2rem", maxWidth: "540px", width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        {children}
      </div>
    </div>
  );
}

function CategoryPicker({ allCategories, selected, onChange }) {
  const toggle = (id) => {
    if (selected.includes(id)) {
      if (selected.length === 1) return;
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
      {allCategories.map(c => {
        const active = selected.includes(c.id);
        return (
          <button key={c.id} onClick={() => toggle(c.id)}
            style={{ padding: "0.38rem 0.9rem", borderRadius: "50px", border: `2px solid ${active ? c.color : c.color + "44"}`, background: active ? c.color + "30" : "transparent", color: active ? c.color : "#777", cursor: "pointer", fontWeight: active ? 700 : 400, fontSize: "0.82rem", transition: "all 0.15s" }}>
            {c.emoji} {c.label}{active && " ✓"}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Login Screen
// ─────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) { setError("נא למלא שם משתמש וסיסמה"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/.netlify/functions/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      ls.set(SESSION_KEY, { token: data.token, username: data.username });
      onLogin({ token: data.token, username: data.username });
    } catch (e) {
      setError(e.message === "Failed to fetch" ? "שגיאת חיבור — האם האפליקציה רצה על Netlify?" : e.message);
    } finally { setLoading(false); }
  };

  const bg = "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)";
  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", direction: "rtl", fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(20px)", borderRadius: "28px", border: "1px solid rgba(255,255,255,0.12)", padding: "3rem", maxWidth: "420px", width: "100%", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "0.8rem" }}>🍽️</div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 800, background: "linear-gradient(135deg, #f8b500, #ff6b6b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "0.3rem" }}>מתכונים שלי</h1>
          <p style={{ color: "#888", fontSize: "0.9rem" }}>התחבר כדי לגשת למתכונים שלך</p>
        </div>

        {/* Username */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", color: "#aaa", fontSize: "0.85rem", marginBottom: "0.4rem", fontWeight: 600 }}>שם משתמש</label>
          <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="הכנס שם משתמש..."
            style={{ width: "100%", padding: "0.85rem 1.2rem", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#e8e8f0", fontSize: "1rem", outline: "none", direction: "rtl", boxSizing: "border-box" }} />
        </div>

        {/* Password */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", color: "#aaa", fontSize: "0.85rem", marginBottom: "0.4rem", fontWeight: 600 }}>סיסמה</label>
          <div style={{ position: "relative" }}>
            <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="הכנס סיסמה..."
              style={{ width: "100%", padding: "0.85rem 3rem 0.85rem 1.2rem", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#e8e8f0", fontSize: "1rem", outline: "none", direction: "rtl", boxSizing: "border-box" }} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: "1rem" }}>{showPw ? "🙈" : "👁️"}</button>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "0.7rem 1rem", marginBottom: "1rem", color: "#EF4444", fontSize: "0.88rem" }}>
            ⚠️ {error}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading}
          style={{ width: "100%", padding: "0.95rem", borderRadius: "14px", border: "none", background: loading ? "rgba(248,181,0,0.3)" : "linear-gradient(135deg, #f8b500, #ff9500)", color: "#1a1a2e", fontWeight: 800, fontSize: "1.05rem", cursor: loading ? "not-allowed" : "pointer", transition: "opacity 0.2s" }}>
          {loading ? "⏳ מתחבר..." : "🔐 התחבר"}
        </button>

        <p style={{ color: "#555", fontSize: "0.78rem", textAlign: "center", marginTop: "1.5rem", lineHeight: 1.6 }}>
          אין לך חשבון? בקש מהמנהל להוסיף אותך.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Category Manager
// ─────────────────────────────────────────────
function CategoryManager({ customCats, onSave, onClose }) {
  const [cats, setCats]      = useState(customCats);
  const [newLabel, setLabel] = useState("");
  const [newEmoji, setEmoji] = useState("🍕");
  const [newColor, setColor] = useState("#F59E0B");
  const [showEmoji, setSE]   = useState(false);

  const addCat = () => {
    if (!newLabel.trim()) return;
    setCats(prev => [...prev, { id: "custom_" + Date.now(), label: newLabel.trim(), emoji: newEmoji, color: newColor, custom: true }]);
    setLabel(""); setEmoji("🍕"); setColor("#F59E0B");
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{ color: "#f8b500", marginBottom: "1.5rem", fontSize: "1.3rem" }}>⚙️ ניהול קטגוריות</h2>
      <p style={{ color: "#888", fontSize: "0.82rem", marginBottom: "0.6rem" }}>קטגוריות מובנות</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.5rem" }}>
        {BUILTIN_CATEGORIES.map(c => (
          <span key={c.id} style={{ padding: "0.3rem 0.8rem", borderRadius: "50px", background: c.color + "22", border: `1px solid ${c.color}44`, color: c.color, fontSize: "0.78rem", fontWeight: 700 }}>{c.emoji} {c.label}</span>
        ))}
      </div>
      {cats.length > 0 && (
        <>
          <p style={{ color: "#888", fontSize: "0.82rem", marginBottom: "0.6rem" }}>קטגוריות מותאמות אישית</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {cats.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.8rem", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize: "1.2rem" }}>{c.emoji}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{c.label}</span>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <button onClick={() => setCats(prev => prev.filter(x => x.id !== c.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF444488", fontSize: "0.9rem" }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={{ color: "#aaa", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.8rem" }}>➕ הוסף קטגוריה חדשה</p>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setSE(!showEmoji)} style={{ padding: "0.6rem 0.9rem", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", cursor: "pointer", fontSize: "1.3rem" }}>{newEmoji}</button>
          {showEmoji && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#1e1b40", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "12px", padding: "0.5rem", display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "4px", zIndex: 10, width: 220 }}>
              {EMOJIS.map(e => <button key={e} onClick={() => { setEmoji(e); setSE(false); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", padding: "3px", borderRadius: "6px" }}>{e}</button>)}
            </div>
          )}
        </div>
        <input value={newLabel} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addCat()} placeholder="שם הקטגוריה..."
          style={{ flex: 1, minWidth: 120, padding: "0.6rem 1rem", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#e8e8f0", fontSize: "0.95rem", outline: "none", direction: "rtl" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "8px", background: newColor, border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem" }}>
            <input type="color" value={newColor} onChange={e => setColor(e.target.value)} style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer", border: "none" }} />🎨
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "1rem" }}>
        {PALETTE.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: 18, height: 18, borderRadius: "4px", background: c, cursor: "pointer", border: newColor === c ? "2px solid white" : "2px solid transparent" }} />)}
      </div>
      <div style={{ display: "flex", gap: "0.7rem" }}>
        <button onClick={addCat} disabled={!newLabel.trim()} style={{ flex: 1, padding: "0.7rem", borderRadius: "12px", border: "none", background: newLabel.trim() ? "linear-gradient(135deg, #f8b500, #ff9500)" : "rgba(248,181,0,0.2)", color: "#1a1a2e", fontWeight: 700, cursor: newLabel.trim() ? "pointer" : "not-allowed" }}>➕ הוסף</button>
        <button onClick={() => { onSave(cats); onClose(); }} style={{ flex: 1, padding: "0.7rem", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #10B981, #059669)", color: "white", fontWeight: 700, cursor: "pointer" }}>✓ שמור</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Category Confirm Modal
// ─────────────────────────────────────────────
function CategoryConfirmModal({ recipe, allCategories, onConfirm, onClose }) {
  const [selected, setSelected] = useState(recipe.categories || ["other"]);
  return (
    <Modal onClose={onClose}>
      <h2 style={{ color: "#f8b500", marginBottom: "0.4rem", fontSize: "1.2rem" }}>✅ המתכון זוהה!</h2>
      <p style={{ color: "#ccc", marginBottom: "0.3rem", fontSize: "0.95rem", fontWeight: 600 }}>"{recipe.title}"</p>
      <p style={{ color: "#888", fontSize: "0.82rem", marginBottom: "1rem" }}>בחר קטגוריה אחת או יותר:</p>
      <CategoryPicker allCategories={allCategories} selected={selected} onChange={setSelected} />
      <p style={{ color: "#666", fontSize: "0.78rem", marginTop: "0.8rem", marginBottom: "1.2rem" }}>
        נבחרו: {selected.map(id => { const c = allCategories.find(x => x.id === id); return c ? `${c.emoji} ${c.label}` : id; }).join(", ")}
      </p>
      <button onClick={() => onConfirm(selected)} style={{ width: "100%", padding: "0.85rem", borderRadius: "14px", border: "none", background: "linear-gradient(135deg, #f8b500, #ff9500)", color: "#1a1a2e", fontWeight: 800, fontSize: "1rem", cursor: "pointer" }}>✓ שמור מתכון</button>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Edit Categories Modal
// ─────────────────────────────────────────────
function EditCategoriesModal({ recipe, allCategories, onSave, onClose }) {
  const [selected, setSelected] = useState(recipe.categories || ["other"]);
  return (
    <Modal onClose={onClose}>
      <h2 style={{ color: "#f8b500", marginBottom: "0.5rem", fontSize: "1.2rem" }}>🏷️ ערוך קטגוריות</h2>
      <p style={{ color: "#888", fontSize: "0.82rem", marginBottom: "1rem" }}>"{recipe.title}"</p>
      <CategoryPicker allCategories={allCategories} selected={selected} onChange={setSelected} />
      <p style={{ color: "#666", fontSize: "0.78rem", marginTop: "0.8rem", marginBottom: "1.2rem" }}>
        נבחרו: {selected.map(id => { const c = allCategories.find(x => x.id === id); return c ? `${c.emoji} ${c.label}` : id; }).join(", ")}
      </p>
      <div style={{ display: "flex", gap: "0.7rem" }}>
        <button onClick={onClose} style={{ flex: 1, padding: "0.7rem", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#aaa", fontWeight: 600, cursor: "pointer" }}>ביטול</button>
        <button onClick={() => onSave(selected)} style={{ flex: 1, padding: "0.7rem", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #f8b500, #ff9500)", color: "#1a1a2e", fontWeight: 800, cursor: "pointer" }}>✓ שמור</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
export default function App() {
  const [session, setSession]         = useState(() => ls.get(SESSION_KEY, null));
  const [authChecked, setAuthChecked] = useState(false);
  const [recipes, setRecipes]         = useState(loadSavedRecipes);
  const [selectedRecipe, setSelected] = useState(() => loadSavedRecipes()[0]);
  const [view, setView]               = useState("detail");
  const [scanning, setScanning]       = useState(false);
  const [scanError, setScanError]     = useState(null);
  const [filterCat, setFilterCat]     = useState("all");
  const [dragOver, setDragOver]       = useState(false);
  const [searchTerm, setSearchTerm]   = useState("");
  const [customCats, setCustomCats]   = useState(() => ls.get(CUSTOM_CAT_KEY, []));
  const [showCatMgr, setShowCatMgr]   = useState(false);
  const [pendingRecipe, setPending]   = useState(null);
  const [editCatFor, setEditCatFor]   = useState(null);
  const fileRef = useRef();

  // Validate session on mount
  useEffect(() => {
    const check = async () => {
      if (!session?.token) { setAuthChecked(true); return; }
      try {
        const res = await fetch("/.netlify/functions/me", {
          headers: { Authorization: `Bearer ${session.token}` },
          method: "POST",
          body: "{}",
        });
        if (!res.ok) { ls.del(SESSION_KEY); setSession(null); }
      } catch { /* offline, keep session */ }
      setAuthChecked(true);
    };
    check();
  }, []);

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "3rem", animation: "spin 1s linear infinite" }}>🍽️</div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={(s) => { ls.set(SESSION_KEY, s); setSession(s); }} />;
  }

  const token = session.token;
  const allCategories = [...BUILTIN_CATEGORIES, ...customCats];
  const getCat  = (id) => allCategories.find(c => c.id === id) || allCategories[allCategories.length - 1];
  const getCats = (ids) => (ids || []).map(id => getCat(id));

  const saveRecipes = (updated) => { setRecipes(updated); ls.set(STORAGE_KEY, updated.filter(r => !r.isDemo)); };
  const saveCustomCats = (cats) => { setCustomCats(cats); ls.set(CUSTOM_CAT_KEY, cats); };

  const logout = () => { ls.del(SESSION_KEY); setSession(null); };

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setScanError(null); setScanning(true); setView("scan");
    try {
      const base64 = await fileToBase64(file);
      const result = await extractAndCategorize(base64, file.type, token, allCategories);
      const newRecipe = { id: Date.now().toString(), ...result, imageBase64: base64, imageType: file.type, createdAt: new Date().toISOString() };
      setPending(newRecipe); setView("library");
    } catch (err) {
      setScanError("שגיאה: " + err.message);
    } finally { setScanning(false); }
  }, [recipes, token, allCategories]);

  const handleDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  const confirmRecipe = (cats) => {
    const recipe  = { ...pendingRecipe, categories: cats };
    const updated = [recipe, ...recipes.filter(r => !r.isDemo)];
    saveRecipes(updated); setSelected(recipe); setPending(null); setView("detail");
  };

  const deleteRecipe = (id) => {
    const updated = recipes.filter(r => r.id !== id);
    const rem     = updated.length > 0 ? updated : [DEMO_RECIPE];
    saveRecipes(rem); setSelected(rem[0]); setView("detail");
  };

  const deleteIngredient = (rid, i) => {
    const upd = recipes.map(r => r.id !== rid ? r : { ...r, ingredients: r.ingredients.filter((_, j) => j !== i) });
    saveRecipes(upd); setSelected(p => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== i) }));
  };

  const deleteInstruction = (rid, i) => {
    const upd = recipes.map(r => r.id !== rid ? r : { ...r, instructions: r.instructions.filter((_, j) => j !== i) });
    saveRecipes(upd); setSelected(p => ({ ...p, instructions: p.instructions.filter((_, j) => j !== i) }));
  };

  const saveRecipeCategories = (rid, cats) => {
    const upd = recipes.map(r => r.id !== rid ? r : { ...r, categories: cats });
    saveRecipes(upd); setSelected(p => ({ ...p, categories: cats })); setEditCatFor(null);
  };

  const realRecipes = recipes.filter(r => !r.isDemo);
  const filtered    = realRecipes.filter(r => {
    const matchCat    = filterCat === "all" || (r.categories || []).includes(filterCat);
    const matchSearch = !searchTerm || r.title?.includes(searchTerm);
    return matchCat && matchSearch;
  });

  const S = {
    app:  { minHeight: "100vh", background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", fontFamily: "'Segoe UI', Tahoma, sans-serif", direction: "rtl", color: "#e8e8f0", display: "flex", flexDirection: "column" },
    hdr:  { padding: "0.9rem 2rem", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" },
    logo: { fontSize: "1.5rem", fontWeight: 800, background: "linear-gradient(135deg, #f8b500, #ff6b6b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
    main: { flex: 1, padding: "2rem", maxWidth: "1100px", margin: "0 auto", width: "100%" },
    card: { background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.1)", padding: "1.5rem" },
    nb:   (a, col) => ({ padding: "0.45rem 1.1rem", borderRadius: "50px", border: `2px solid ${a ? (col||"#f8b500") : "rgba(255,255,255,0.15)"}`, background: a ? (col||"#f8b500")+"22" : "transparent", color: a ? (col||"#f8b500") : "#aaa", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", transition: "all 0.2s" }),
    badge:(c) => ({ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.28rem 0.75rem", borderRadius: "50px", background: c.color + "22", border: `1px solid ${c.color}55`, color: c.color, fontSize: "0.76rem", fontWeight: 700 }),
    drop: (o) => ({ border: `2px dashed ${o ? "#f8b500" : "rgba(255,255,255,0.2)"}`, borderRadius: "24px", padding: "2.5rem 2rem", textAlign: "center", cursor: "pointer", background: o ? "rgba(248,181,0,0.07)" : "rgba(255,255,255,0.03)", transition: "all 0.3s" }),
    inp:  { padding: "0.7rem 1.2rem", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#e8e8f0", fontSize: "1rem", outline: "none", direction: "rtl", width: "100%" },
    del:  { padding: "0.45rem 1rem", borderRadius: "10px", border: "1px solid #EF444455", background: "rgba(239,68,68,0.1)", color: "#EF4444", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.5rem" },
    rc:   { background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s" },
  };

  const FileInput = () => <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />;

  const UserBadge = () => (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <span style={{ color: "#aaa", fontSize: "0.85rem" }}>שלום, <strong style={{ color: "#f8b500" }}>{session.username}</strong></span>
      <button onClick={logout} style={{ padding: "0.35rem 0.8rem", borderRadius: "50px", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#666", cursor: "pointer", fontSize: "0.8rem" }}>יציאה</button>
    </div>
  );

  const NavButtons = ({ showBack }) => (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      {showBack
        ? <button style={S.nb(false)} onClick={() => setView("library")}>← ספרייה ({realRecipes.length})</button>
        : <button style={S.nb(true)}>📚 ספרייה ({realRecipes.length})</button>}
      <button style={S.nb(false)} onClick={() => fileRef.current?.click()}>➕ מתכון חדש</button>
      <button style={{ ...S.nb(false), color: "#10B981", borderColor: "#10B98144" }} onClick={() => setShowCatMgr(true)}>🏷️ קטגוריות</button>
      <UserBadge />
    </div>
  );

  // ── SCAN VIEW ─────────────────────────────
  if (view === "scan") return (
    <div style={S.app}>
      <header style={S.hdr}><span style={S.logo}>🍽️ מתכונים שלי</span><UserBadge /></header>
      <div style={{ ...S.main, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          {scanning
            ? <><div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔍</div><p style={{ fontSize: "1.3rem", color: "#f8b500" }}>מעבד את המתכון...</p><p style={{ color: "#aaa" }}>מזהה טקסט עברי ומסווג בקטגוריות</p></>
            : scanError && <><p style={{ color: "#EF4444", fontSize: "1rem", marginBottom: "1rem" }}>{scanError}</p><button style={S.del} onClick={() => setView("library")}>חזרה לספרייה</button></>}
        </div>
      </div>
    </div>
  );

  // ── DETAIL VIEW ───────────────────────────
  if (view === "detail" && selectedRecipe) {
    const cats = getCats(selectedRecipe.categories);
    return (
      <div style={S.app}>
        {showCatMgr && <CategoryManager customCats={customCats} onSave={saveCustomCats} onClose={() => setShowCatMgr(false)} />}
        {editCatFor && <EditCategoriesModal recipe={editCatFor} allCategories={allCategories} onSave={(c) => saveRecipeCategories(editCatFor.id, c)} onClose={() => setEditCatFor(null)} />}
        <header style={S.hdr}>
          <span style={S.logo}>🍽️ מתכונים שלי</span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <NavButtons showBack />
            {!selectedRecipe.isDemo && <>
              <button style={{ ...S.nb(false), color: "#10B981", borderColor: "#10B98144" }} onClick={() => setEditCatFor(selectedRecipe)}>🏷️</button>
              <button style={S.del} onClick={() => deleteRecipe(selectedRecipe.id)}>🗑️ מחק</button>
            </>}
          </div>
          <FileInput />
        </header>
        <div style={S.main}>
          {selectedRecipe.isDemo && (
            <div style={{ background: "rgba(248,181,0,0.08)", border: "1px solid rgba(248,181,0,0.25)", borderRadius: "12px", padding: "0.7rem 1.2rem", marginBottom: "1.5rem", fontSize: "0.88rem", color: "#f8b500" }}>
              👋 זהו מתכון לדוגמה — לחץ "➕ מתכון חדש" להעלאת תמונה!
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: selectedRecipe.imageBase64 ? "1fr 300px" : "1fr", gap: "2rem", alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                {cats.map(cat => <span key={cat.id} style={S.badge(cat)}>{cat.emoji} {cat.label}</span>)}
                {selectedRecipe.prepTime && <span style={{ color: "#aaa", fontSize: "0.82rem" }}>⏱ {selectedRecipe.prepTime}</span>}
                {selectedRecipe.cookTime && <span style={{ color: "#aaa", fontSize: "0.82rem" }}>🔥 {selectedRecipe.cookTime}</span>}
                {selectedRecipe.servings && <span style={{ color: "#aaa", fontSize: "0.82rem" }}>👥 {selectedRecipe.servings}</span>}
              </div>
              <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginBottom: "1.5rem", lineHeight: 1.2 }}>{selectedRecipe.title}</h1>
              {selectedRecipe.ingredients?.length > 0 && (
                <div style={{ ...S.card, marginBottom: "1.5rem" }}>
                  <h3 style={{ color: "#f8b500", marginBottom: "0.8rem", fontSize: "1.05rem" }}>🧺 מצרכים</h3>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {selectedRecipe.ingredients.map((ing, i) => (
                      <li key={i} style={{ padding: "0.4rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: "#f8b500", flexShrink: 0 }}>•</span><span style={{ flex: 1 }}>{ing}</span>
                        <DeleteBtn onClick={() => deleteIngredient(selectedRecipe.id, i)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedRecipe.instructions?.length > 0 && (
                <div style={{ ...S.card, marginBottom: "1.5rem" }}>
                  <h3 style={{ color: "#f8b500", marginBottom: "0.8rem", fontSize: "1.05rem" }}>👨‍🍳 הוראות הכנה</h3>
                  <ol style={{ margin: 0, padding: "0 1.2rem", direction: "rtl" }}>
                    {selectedRecipe.instructions.map((step, i) => (
                      <li key={i} style={{ padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.6 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                          <span style={{ flex: 1 }}>{step}</span>
                          <DeleteBtn onClick={() => deleteInstruction(selectedRecipe.id, i)} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {selectedRecipe.notes && (
                <div style={{ ...S.card, background: "rgba(248,181,0,0.06)", borderColor: "rgba(248,181,0,0.2)" }}>
                  <h3 style={{ color: "#f8b500", marginBottom: "0.5rem" }}>📝 הערות</h3>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{selectedRecipe.notes}</p>
                </div>
              )}
            </div>
            {selectedRecipe.imageBase64 && (
              <div>
                <img src={`data:${selectedRecipe.imageType};base64,${selectedRecipe.imageBase64}`} alt="מקור" style={{ width: "100%", borderRadius: "20px", boxShadow: "0 8px 40px #0008", border: "1px solid rgba(255,255,255,0.1)" }} />
                <p style={{ color: "#666", fontSize: "0.75rem", textAlign: "center", marginTop: "0.5rem" }}>נוסף: {new Date(selectedRecipe.createdAt).toLocaleDateString("he-IL")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── LIBRARY VIEW ──────────────────────────
  return (
    <div style={S.app}>
      {showCatMgr && <CategoryManager customCats={customCats} onSave={saveCustomCats} onClose={() => setShowCatMgr(false)} />}
      {pendingRecipe && <CategoryConfirmModal recipe={pendingRecipe} allCategories={allCategories} onConfirm={confirmRecipe} onClose={() => setPending(null)} />}
      <header style={S.hdr}>
        <span style={S.logo}>🍽️ מתכונים שלי</span>
        <NavButtons /><FileInput />
      </header>
      <div style={S.main}>
        <div style={S.drop(dragOver)} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
          <div style={{ fontSize: "2.8rem", marginBottom: "0.8rem" }}>📸</div>
          <p style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.3rem" }}>גרור תמונת מתכון לכאן</p>
          <p style={{ color: "#888", fontSize: "0.88rem" }}>או לחץ לבחירת קובץ • תומך בעברית • מסווג אוטומטית</p>
        </div>
        {realRecipes.length > 0 && (
          <>
            <div style={{ display: "flex", gap: "1rem", margin: "1.5rem 0", flexWrap: "wrap", alignItems: "center" }}>
              <input style={{ ...S.inp, maxWidth: 240 }} placeholder="🔍 חפש מתכון..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button style={{ ...S.nb(filterCat === "all"), fontSize: "0.78rem", padding: "0.32rem 0.85rem" }} onClick={() => setFilterCat("all")}>הכל</button>
                {allCategories.filter(c => realRecipes.some(r => (r.categories || []).includes(c.id))).map(cat => (
                  <button key={cat.id} style={{ ...S.nb(filterCat === cat.id, cat.color), fontSize: "0.78rem", padding: "0.32rem 0.85rem" }} onClick={() => setFilterCat(cat.id)}>{cat.emoji} {cat.label}</button>
                ))}
              </div>
            </div>
            <div style={S.grid}>
              {filtered.map(recipe => {
                const cats = getCats(recipe.categories);
                return (
                  <div key={recipe.id} style={S.rc} onClick={() => { setSelected(recipe); setView("detail"); }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                    {recipe.imageBase64 && <div style={{ height: 150, overflow: "hidden" }}><img src={`data:${recipe.imageType};base64,${recipe.imageBase64}`} alt={recipe.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
                    <div style={{ padding: "1rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.5rem" }}>
                        {cats.map(cat => <span key={cat.id} style={S.badge(cat)}>{cat.emoji} {cat.label}</span>)}
                      </div>
                      <h3 style={{ margin: "0.3rem 0", fontSize: "0.97rem", fontWeight: 700, lineHeight: 1.3 }}>{recipe.title}</h3>
                      <p style={{ color: "#666", fontSize: "0.77rem", margin: 0 }}>{new Date(recipe.createdAt).toLocaleDateString("he-IL")}{recipe.servings ? ` · ${recipe.servings}` : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && <div style={{ textAlign: "center", color: "#666", padding: "3rem" }}><div style={{ fontSize: "2.5rem" }}>🔍</div><p>לא נמצאו מתכונים</p></div>}
          </>
        )}
        {realRecipes.length === 0 && <div style={{ textAlign: "center", color: "#555", padding: "3rem" }}><div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🍴</div><p style={{ fontSize: "1.1rem" }}>עדיין אין מתכונים. העלה תמונה להתחיל!</p></div>}
      </div>
    </div>
  );
}
