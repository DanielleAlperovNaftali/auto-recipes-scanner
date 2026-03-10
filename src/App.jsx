import { useState, useCallback, useRef, useEffect } from "react";

const BUILTIN_CATEGORIES = [
  { id: "breakfast", label: "ארוחת בוקר",    emoji: "🌅", color: "#F59E0B" },
  { id: "lunch",     label: "ארוחת צהריים",  emoji: "☀️", color: "#10B981" },
  { id: "dinner",    label: "ארוחת ערב",     emoji: "🌙", color: "#6366F1" },
  { id: "meat",      label: "בשרי",          emoji: "🥩", color: "#EF4444" },
  { id: "dairy",     label: "חלבי",          emoji: "🧀", color: "#3B82F6" },
  { id: "pareve",    label: "פרווה",         emoji: "🥗", color: "#14B8A6" },
  { id: "cakes",     label: "עוגות ומתוקים", emoji: "🎂", color: "#EC4899" },
  { id: "soup",      label: "מרקים",         emoji: "🍲", color: "#F97316" },
  { id: "salad",     label: "סלטים",         emoji: "🥙", color: "#84CC16" },
  { id: "side",      label: "תוספות",        emoji: "🍚", color: "#8B5CF6" },
  { id: "snack",     label: "חטיפים",        emoji: "🥨", color: "#06B6D4" },
  { id: "other",     label: "אחר",           emoji: "📋", color: "#9CA3AF" },
];

const PALETTE = ["#F59E0B","#10B981","#6366F1","#EF4444","#3B82F6","#14B8A6","#EC4899","#F97316","#84CC16","#8B5CF6","#06B6D4","#9CA3AF","#E11D48","#7C3AED","#059669","#D97706","#0EA5E9","#65A30D","#DC2626"];
const EMOJIS  = ["🍕","🍜","🥘","🫕","🥗","🥩","🍗","🐟","🥚","🧆","🥐","🍞","🧇","🥞","🍰","🧁","🍮","🍦","🫙","🥫","🥦","🧅","🫚","🧄","🌶️","🍅","🥕","🥜","🌽","🫛"];

const SESSION_KEY = "hebrew-recipes-session";

const DEMO_RECIPE = {
  id: "demo-1", title: "עוגת שוקולד קלאסית", categories: ["cakes","dairy"],
  ingredients: ["2 כוסות קמח","1.5 כוסות סוכר","3/4 כוס אבקת קקאו","2 כפיות אבקת אפייה","1 כפית סודה לשתייה","1 כפית מלח","2 ביצים גדולות","1 כוס חלב","1/2 כוס שמן צמחי","1 כפית תמצית וניל","1 כוס מים רותחים"],
  instructions: ["מחממים תנור ל-175 מעלות ומשמנים תבנית עגולה בקוטר 23 ס״מ.","מערבבים בקערה גדולה את כל החומרים היבשים: קמח, סוכר, קקאו, אבקת אפייה, סודה ומלח.","מוסיפים ביצים, חלב, שמן ווניל ומערבבים במהירות בינונית למשך 2 דקות.","מוסיפים מים רותחים ומערבבים. הבלילה תהיה דלילה – זה תקין.","יוצקים לתבנית ואופים 30-35 דקות, עד שקיסם יוצא נקי.","מצננים 10 דקות בתבנית, ואז הופכים לרשת לצינון מלא."],
  prepTime: "15 דקות", cookTime: "35 דקות", servings: "12 מנות",
  notes: "ניתן להוסיף 1/2 כוס שוקולד צ'יפס לבלילה לטעם עשיר יותר.",
  imageBase64: null, imageType: null, createdAt: new Date().toISOString(), isDemo: true,
};

// ── Helpers ──────────────────────────────────
const ls = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)    => { try { localStorage.removeItem(k); } catch {} },
};

function migrateRecipe(r) {
  if (r.categories) return r;
  return { ...r, categories: r.category ? [r.category] : ["other"], category: undefined };
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
  });
}

async function apiFetch(path, opts, token) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) },
  });
  return res;
}

async function loadUserData(token) {
  const res = await apiFetch("/.netlify/functions/recipes", { method: "GET" }, token);
  if (!res.ok) return { recipes: [], customCats: [] };
  return res.json();
}

async function saveUserData(token, recipes, customCats) {
  await apiFetch("/.netlify/functions/recipes", { method: "POST", body: JSON.stringify({ recipes, customCats }) }, token);
}

async function claudeViaProxy(body, token) {
  const res = await apiFetch("/.netlify/functions/claude-proxy", { method: "POST", body: JSON.stringify(body) }, token);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || `Error ${res.status}`); }
  return res.json();
}

async function extractAndCategorize(base64Image, mediaType, token, allCategories) {
  const catList = allCategories.map(c => `${c.id}: ${c.label}`).join(", ");
  const data = await claudeViaProxy({
    model: "claude-sonnet-4-20250514", max_tokens: 1500,
    system: `You are a Hebrew recipe extractor. Extract from this screenshot:
1. Recipe title in Hebrew
2. ALL matching categories from: ${catList} (can be multiple)
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
  const text   = data.content?.map(b => b.text || "").join("") || "";
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  const allIds = allCategories.map(c => c.id);
  parsed.categories = (parsed.categories || []).filter(id => allIds.includes(id));
  if (parsed.categories.length === 0) parsed.categories = ["other"];
  return parsed;
}

// ── UI Primitives ────────────────────────────
function DeleteBtn({ onClick }) {
  const [h, sH] = useState(false);
  return <button onClick={onClick} onMouseEnter={() => sH(true)} onMouseLeave={() => sH(false)}
    style={{ background: h?"rgba(239,68,68,0.15)":"transparent", border:"1px solid", borderColor: h?"#EF4444":"rgba(239,68,68,0.4)", borderRadius:"6px", cursor:"pointer", color: h?"#EF4444":"rgba(239,68,68,0.55)", fontSize:"0.78rem", fontWeight:700, padding:"1px 6px", flexShrink:0, lineHeight:1.7, transition:"all 0.15s", minWidth:"22px", textAlign:"center" }}>✕</button>;
}

function EditableLineItem({ text, bullet, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(text);
  const inputRef              = useRef();

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== text) onSave(trimmed);
    else setVal(text);
    setEditing(false);
  };

  if (editing) return (
    <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", padding:"0.3rem 0", width:"100%" }}>
      {bullet && <span style={{ color:"#f8b500", flexShrink:0 }}>{bullet}</span>}
      <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)} dir="rtl" autoFocus
        onKeyDown={e => { if (e.key==="Enter") commit(); if (e.key==="Escape") { setVal(text); setEditing(false); } }}
        style={{ flex:1, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(248,181,0,0.5)", borderRadius:"8px", color:"#e8e8f0", fontSize:"0.95rem", padding:"0.3rem 0.6rem", outline:"none", direction:"rtl" }} />
      <button onClick={commit} style={{ background:"rgba(248,181,0,0.2)", border:"1px solid rgba(248,181,0,0.4)", borderRadius:"6px", color:"#f8b500", fontSize:"0.78rem", fontWeight:700, padding:"1px 7px", cursor:"pointer", flexShrink:0, lineHeight:1.7 }}>✓</button>
      <button onClick={() => { setVal(text); setEditing(false); }} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"6px", color:"#888", fontSize:"0.78rem", fontWeight:700, padding:"1px 6px", cursor:"pointer", flexShrink:0, lineHeight:1.7 }}>✕</button>
    </div>
  );

  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:"0.5rem", width:"100%" }}>
      {bullet && <span style={{ color:"#f8b500", flexShrink:0, marginTop:"0.1rem" }}>{bullet}</span>}
      <span style={{ flex:1, fontSize:"0.95rem", lineHeight:1.6 }}>{text}</span>
      <button onClick={() => setEditing(true)} title="ערוך"
        style={{ background:"transparent", border:"1px solid rgba(96,165,250,0.35)", borderRadius:"6px", cursor:"pointer", color:"rgba(96,165,250,0.7)", fontSize:"0.72rem", padding:"1px 5px", flexShrink:0, lineHeight:1.7, transition:"all 0.15s" }}>✎</button>
      <DeleteBtn onClick={onDelete} />
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(5px)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:1000, padding:"0" }}>
      <div onClick={e => e.stopPropagation()} className={`modal-inner${wide?" modal-wide":""}`}>
        {children}
      </div>
    </div>
  );
}

function CategoryPicker({ allCategories, selected, onChange }) {
  const toggle = id => {
    if (selected.includes(id)) { if (selected.length === 1) return; onChange(selected.filter(s => s !== id)); }
    else onChange([...selected, id]);
  };
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"0.45rem" }}>
      {allCategories.map(c => {
        const active = selected.includes(c.id);
        return <button key={c.id} onClick={() => toggle(c.id)}
          style={{ padding:"0.38rem 0.9rem", borderRadius:"50px", border:`2px solid ${active?c.color:c.color+"44"}`, background:active?c.color+"30":"transparent", color:active?c.color:"#777", cursor:"pointer", fontWeight:active?700:400, fontSize:"0.82rem", transition:"all 0.15s" }}>
          {c.emoji} {c.label}{active?" ✓":""}
        </button>;
      })}
    </div>
  );
}

// ── Image Crop Modal ─────────────────────────
function CropModal({ imageBase64, imageType, onCrop, onSkip }) {
  const canvasRef = useRef();
  const imgRef    = useRef();
  const [drag, setDrag]     = useState(false);
  const [start, setStart]   = useState(null);
  const [rect, setRect]     = useState(null);
  const [loaded, setLoaded] = useState(false);

  const drawCanvas = (cropRect) => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    if (cropRect) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.strokeStyle = "#f8b500";
      ctx.lineWidth   = 3;
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    }
  };

  useEffect(() => { if (loaded) drawCanvas(rect); }, [loaded, rect]);

  const toRatio = (e) => {
    const canvas  = canvasRef.current;
    const bounds  = canvas.getBoundingClientRect();
    const scaleX  = canvas.width  / bounds.width;
    const scaleY  = canvas.height / bounds.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - bounds.left) * scaleX, y: (clientY - bounds.top) * scaleY };
  };

  const onDown  = e => { const p = toRatio(e); setDrag(true); setStart(p); setRect(null); };
  const onMove  = e => { if (!drag || !start) return; const p = toRatio(e); setRect({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }); };
  const onUp    = ()  => setDrag(false);

  const applyCrop = () => {
    if (!rect || rect.w < 10 || rect.h < 10) { onSkip(); return; }
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    const out    = document.createElement("canvas");
    out.width    = rect.w; out.height = rect.h;
    out.getContext("2d").drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const b64 = out.toDataURL(imageType).split(",")[1];
    onCrop(b64, imageType);
  };

  return (
    <Modal onClose={onSkip} wide>
      <h2 style={{ color:"#f8b500", marginBottom:"0.5rem" }}>✂️ חתוך תמונה</h2>
      <p style={{ color:"#888", fontSize:"0.85rem", marginBottom:"1rem" }}>גרור לבחירת אזור. לחץ "חתוך" לשמירה, או "דלג" להמשך ללא חיתוך.</p>
      <img ref={imgRef} src={`data:${imageType};base64,${imageBase64}`} onLoad={() => setLoaded(true)} style={{ display:"none" }} alt="" />
      <canvas ref={canvasRef}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        style={{ width:"100%", borderRadius:"12px", cursor:"crosshair", userSelect:"none", touchAction:"none", border:"1px solid rgba(255,255,255,0.1)" }} />
      <div style={{ display:"flex", gap:"0.7rem", marginTop:"1rem" }}>
        <button onClick={onSkip} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.15)", background:"transparent", color:"#aaa", fontWeight:600, cursor:"pointer" }}>דלג</button>
        <button onClick={applyCrop} disabled={!rect || rect.w < 10} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"none", background: rect&&rect.w>10?"linear-gradient(135deg,#f8b500,#ff9500)":"rgba(248,181,0,0.2)", color:"#1a1a2e", fontWeight:800, cursor: rect&&rect.w>10?"pointer":"not-allowed" }}>✂️ חתוך</button>
      </div>
    </Modal>
  );
}

// ── Confirm / Edit Modal (post-scan) ─────────
function ConfirmModal({ recipe, allCategories, onConfirm, onClose }) {
  const [title,    setTitle]    = useState(recipe.title || "");
  const [selected, setSelected] = useState(recipe.categories || ["other"]);
  const [imgB64,   setImgB64]   = useState(recipe.imageBase64);
  const [imgType,  setImgType]  = useState(recipe.imageType);
  const [cropping, setCropping] = useState(true); // show crop first

  if (cropping && imgB64) {
    return <CropModal imageBase64={imgB64} imageType={imgType}
      onCrop={(b64, type) => { setImgB64(b64); setImgType(type); setCropping(false); }}
      onSkip={() => setCropping(false)} />;
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ color:"#f8b500", marginBottom:"1rem", fontSize:"1.2rem" }}>✅ אשר ושמור מתכון</h2>

      {/* Editable title */}
      <label style={{ color:"#aaa", fontSize:"0.82rem", fontWeight:600, display:"block", marginBottom:"0.4rem" }}>שם המתכון</label>
      <input value={title} onChange={e => setTitle(e.target.value)} dir="rtl"
        style={{ width:"100%", padding:"0.75rem 1rem", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.08)", color:"#e8e8f0", fontSize:"1rem", outline:"none", marginBottom:"1.2rem", boxSizing:"border-box" }} />

      {/* Category picker */}
      <label style={{ color:"#aaa", fontSize:"0.82rem", fontWeight:600, display:"block", marginBottom:"0.6rem" }}>קטגוריות</label>
      <CategoryPicker allCategories={allCategories} selected={selected} onChange={setSelected} />
      <p style={{ color:"#555", fontSize:"0.78rem", marginTop:"0.6rem", marginBottom:"1.2rem" }}>
        {selected.map(id => { const c = allCategories.find(x=>x.id===id); return c?`${c.emoji} ${c.label}`:id; }).join(", ")}
      </p>

      {/* Cropped preview */}
      {imgB64 && <img src={`data:${imgType};base64,${imgB64}`} alt="" style={{ width:"100%", borderRadius:"12px", marginBottom:"1rem", maxHeight:200, objectFit:"cover" }} />}
      {imgB64 && <button onClick={() => setCropping(true)} style={{ width:"100%", padding:"0.5rem", borderRadius:"10px", border:"1px solid rgba(248,181,0,0.3)", background:"rgba(248,181,0,0.08)", color:"#f8b500", cursor:"pointer", fontSize:"0.85rem", marginBottom:"1rem" }}>✂️ חתוך תמונה מחדש</button>}

      <button onClick={() => onConfirm(title.trim() || recipe.title, selected, imgB64, imgType)}
        style={{ width:"100%", padding:"0.85rem", borderRadius:"14px", border:"none", background:"linear-gradient(135deg,#f8b500,#ff9500)", color:"#1a1a2e", fontWeight:800, fontSize:"1rem", cursor:"pointer" }}>
        ✓ שמור מתכון
      </button>
    </Modal>
  );
}

// ── Edit Categories Modal ─────────────────────
function EditCategoriesModal({ recipe, allCategories, onSave, onClose }) {
  const [selected, setSelected] = useState(recipe.categories || ["other"]);
  return (
    <Modal onClose={onClose}>
      <h2 style={{ color:"#f8b500", marginBottom:"0.5rem", fontSize:"1.2rem" }}>🏷️ ערוך קטגוריות</h2>
      <p style={{ color:"#888", fontSize:"0.82rem", marginBottom:"1rem" }}>"{recipe.title}"</p>
      <CategoryPicker allCategories={allCategories} selected={selected} onChange={setSelected} />
      <p style={{ color:"#666", fontSize:"0.78rem", marginTop:"0.8rem", marginBottom:"1.2rem" }}>
        {selected.map(id => { const c = allCategories.find(x=>x.id===id); return c?`${c.emoji} ${c.label}`:id; }).join(", ")}
      </p>
      <div style={{ display:"flex", gap:"0.7rem" }}>
        <button onClick={onClose} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.15)", background:"transparent", color:"#aaa", fontWeight:600, cursor:"pointer" }}>ביטול</button>
        <button onClick={() => onSave(selected)} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"none", background:"linear-gradient(135deg,#f8b500,#ff9500)", color:"#1a1a2e", fontWeight:800, cursor:"pointer" }}>✓ שמור</button>
      </div>
    </Modal>
  );
}

// ── Category Manager ──────────────────────────
function CategoryManager({ customCats, onSave, onClose }) {
  const [cats, setCats]      = useState(customCats);
  const [newLabel, setLabel] = useState("");
  const [newEmoji, setEmoji] = useState("🍕");
  const [newColor, setColor] = useState("#F59E0B");
  const [showEmoji, setSE]   = useState(false);

  const addCat = () => {
    if (!newLabel.trim()) return;
    setCats(prev => [...prev, { id:"custom_"+Date.now(), label:newLabel.trim(), emoji:newEmoji, color:newColor, custom:true }]);
    setLabel(""); setEmoji("🍕"); setColor("#F59E0B");
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{ color:"#f8b500", marginBottom:"1.5rem", fontSize:"1.3rem" }}>⚙️ ניהול קטגוריות</h2>
      <p style={{ color:"#888", fontSize:"0.82rem", marginBottom:"0.6rem" }}>קטגוריות מובנות</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"0.4rem", marginBottom:"1.5rem" }}>
        {BUILTIN_CATEGORIES.map(c => <span key={c.id} style={{ padding:"0.3rem 0.8rem", borderRadius:"50px", background:c.color+"22", border:`1px solid ${c.color}44`, color:c.color, fontSize:"0.78rem", fontWeight:700 }}>{c.emoji} {c.label}</span>)}
      </div>
      {cats.length > 0 && (
        <>
          <p style={{ color:"#888", fontSize:"0.82rem", marginBottom:"0.6rem" }}>קטגוריות מותאמות</p>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem", marginBottom:"1.5rem" }}>
            {cats.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:"0.6rem", padding:"0.5rem 0.8rem", borderRadius:"12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize:"1.2rem" }}>{c.emoji}</span>
                <span style={{ flex:1, fontWeight:600 }}>{c.label}</span>
                <span style={{ width:14, height:14, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                <button onClick={() => setCats(prev => prev.filter(x => x.id !== c.id))} style={{ background:"none", border:"none", cursor:"pointer", color:"#EF444488", fontSize:"0.9rem" }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
      <p style={{ color:"#aaa", fontSize:"0.85rem", fontWeight:600, marginBottom:"0.8rem" }}>➕ הוסף קטגוריה חדשה</p>
      <div style={{ display:"flex", gap:"0.5rem", marginBottom:"0.6rem", flexWrap:"wrap" }}>
        <div style={{ position:"relative" }}>
          <button onClick={() => setSE(!showEmoji)} style={{ padding:"0.6rem 0.9rem", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", cursor:"pointer", fontSize:"1.3rem" }}>{newEmoji}</button>
          {showEmoji && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", right:0, background:"#1e1b40", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"12px", padding:"0.5rem", display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"4px", zIndex:10, width:220 }}>
              {EMOJIS.map(e => <button key={e} onClick={() => { setEmoji(e); setSE(false); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:"1.2rem", padding:"3px", borderRadius:"6px" }}>{e}</button>)}
            </div>
          )}
        </div>
        <input value={newLabel} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key==="Enter"&&addCat()} placeholder="שם הקטגוריה..."
          style={{ flex:1, minWidth:120, padding:"0.6rem 1rem", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#e8e8f0", fontSize:"0.95rem", outline:"none", direction:"rtl" }} />
        <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
          <div style={{ width:36, height:36, borderRadius:"8px", background:newColor, border:"2px solid rgba(255,255,255,0.2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.6rem" }}>
            <input type="color" value={newColor} onChange={e => setColor(e.target.value)} style={{ opacity:0, position:"absolute", inset:0, width:"100%", height:"100%", cursor:"pointer", border:"none" }} />🎨
          </div>
        </div>
      </div>
      <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginBottom:"1rem" }}>
        {PALETTE.map(c => <div key={c} onClick={() => setColor(c)} style={{ width:18, height:18, borderRadius:"4px", background:c, cursor:"pointer", border:newColor===c?"2px solid white":"2px solid transparent" }} />)}
      </div>
      <div style={{ display:"flex", gap:"0.7rem" }}>
        <button onClick={addCat} disabled={!newLabel.trim()} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"none", background:newLabel.trim()?"linear-gradient(135deg,#f8b500,#ff9500)":"rgba(248,181,0,0.2)", color:"#1a1a2e", fontWeight:700, cursor:newLabel.trim()?"pointer":"not-allowed" }}>➕ הוסף</button>
        <button onClick={() => { onSave(cats); onClose(); }} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"none", background:"linear-gradient(135deg,#10B981,#059669)", color:"white", fontWeight:700, cursor:"pointer" }}>✓ שמור</button>
      </div>
    </Modal>
  );
}

// ── Login Screen ──────────────────────────────
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
      const res  = await fetch("/.netlify/functions/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ username:username.trim(), password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      ls.set(SESSION_KEY, { token:data.token, username:data.username });
      onLogin({ token:data.token, username:data.username });
    } catch (e) {
      setError(e.message === "Failed to fetch" ? "שגיאת חיבור" : e.message);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)", display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", direction:"rtl", fontFamily:"'Segoe UI',Tahoma,sans-serif" }}>
      <div style={{ background:"rgba(255,255,255,0.07)", backdropFilter:"blur(20px)", borderRadius:"28px", border:"1px solid rgba(255,255,255,0.12)", padding:"3rem", maxWidth:"420px", width:"100%", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <div style={{ fontSize:"3.5rem", marginBottom:"0.8rem" }}>🍽️</div>
          <h1 style={{ fontSize:"1.8rem", fontWeight:800, background:"linear-gradient(135deg,#f8b500,#ff6b6b)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:"0.3rem" }}>מתכונים שלי</h1>
          <p style={{ color:"#888", fontSize:"0.9rem" }}>התחבר כדי לגשת למתכונים שלך</p>
        </div>
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block", color:"#aaa", fontSize:"0.85rem", marginBottom:"0.4rem", fontWeight:600 }}>שם משתמש</label>
          <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key==="Enter"&&handleLogin()} placeholder="הכנס שם משתמש..."
            style={{ width:"100%", padding:"0.85rem 1.2rem", borderRadius:"14px", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#e8e8f0", fontSize:"1rem", outline:"none", direction:"rtl", boxSizing:"border-box" }} />
        </div>
        <div style={{ marginBottom:"1.5rem" }}>
          <label style={{ display:"block", color:"#aaa", fontSize:"0.85rem", marginBottom:"0.4rem", fontWeight:600 }}>סיסמה</label>
          <div style={{ position:"relative" }}>
            <input type={showPw?"text":"password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter"&&handleLogin()} placeholder="הכנס סיסמה..."
              style={{ width:"100%", padding:"0.85rem 3rem 0.85rem 1.2rem", borderRadius:"14px", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#e8e8f0", fontSize:"1rem", outline:"none", direction:"rtl", boxSizing:"border-box" }} />
            <button onClick={() => setShowPw(!showPw)} style={{ position:"absolute", left:"0.8rem", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#888", fontSize:"1rem" }}>{showPw?"🙈":"👁️"}</button>
          </div>
        </div>
        {error && <div style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:"12px", padding:"0.7rem 1rem", marginBottom:"1rem", color:"#EF4444", fontSize:"0.88rem" }}>⚠️ {error}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width:"100%", padding:"0.95rem", borderRadius:"14px", border:"none", background:loading?"rgba(248,181,0,0.3)":"linear-gradient(135deg,#f8b500,#ff9500)", color:"#1a1a2e", fontWeight:800, fontSize:"1.05rem", cursor:loading?"not-allowed":"pointer" }}>
          {loading?"⏳ מתחבר...":"🔐 התחבר"}
        </button>
        <p style={{ color:"#555", fontSize:"0.78rem", textAlign:"center", marginTop:"1.5rem" }}>אין לך חשבון? בקש מהמנהל להוסיף אותך.</p>
      </div>
    </div>
  );
}

// ── Auth Shell ────────────────────────────────
export default function App() {
  const [session, setSession]         = useState(() => ls.get(SESSION_KEY, null));
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!session?.token) { setAuthChecked(true); return; }
    try {
      const b64 = session.token.replace(/-/g,"+").replace(/_/g,"/");
      const pad = b64.length%4===0?"":"=".repeat(4-(b64.length%4));
      const payload = JSON.parse(atob(b64+pad));
      if (!payload.exp || Date.now() > payload.exp) { ls.del(SESSION_KEY); setSession(null); }
    } catch { ls.del(SESSION_KEY); setSession(null); }
    setAuthChecked(true);
  }, []);

  if (!authChecked) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:"3rem" }}>🍽️</div>
    </div>
  );

  if (!session) return <LoginScreen onLogin={s => { ls.set(SESSION_KEY, s); setSession(s); }} />;

  return <RecipeApp session={session} onLogout={() => { ls.del(SESSION_KEY); setSession(null); }} />;
}

// ── Recipe App ────────────────────────────────
function RecipeApp({ session, onLogout }) {
  const token = session.token;

  const [recipes, setRecipes]         = useState([DEMO_RECIPE]);
  const [selectedRecipe, setSelected] = useState(DEMO_RECIPE);
  const [view, setView]               = useState("detail");
  const [scanning, setScanning]       = useState(false);
  const [scanError, setScanError]     = useState(null);
  const [filterCat, setFilterCat]     = useState("all");
  const [dragOver, setDragOver]       = useState(false);
  const [searchTerm, setSearchTerm]   = useState("");
  const [customCats, setCustomCats]   = useState([]);
  const [showCatMgr, setShowCatMgr]   = useState(false);
  const [pendingRecipe, setPending]   = useState(null);
  const [editCatFor, setEditCatFor]   = useState(null);
  const [editTitleFor, setEditTitleFor] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState("");
  const [loading, setLoading]         = useState(true);
  const fileRef = useRef();

  // Load data from server on mount
  useEffect(() => {
    loadUserData(token).then(data => {
      const loaded = (data.recipes || []).map(r => r.categories ? r : { ...r, categories: r.category ? [r.category] : ["other"] });
      setRecipes(loaded.length > 0 ? loaded : [DEMO_RECIPE]);
      setSelected(loaded.length > 0 ? loaded[0] : DEMO_RECIPE);
      setCustomCats(data.customCats || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const allCategories = [...BUILTIN_CATEGORIES, ...customCats];
  const getCat  = id => allCategories.find(c => c.id === id) || allCategories[allCategories.length-1];
  const getCats = ids => (ids || []).map(id => getCat(id));

  const persist = (newRecipes, newCats) => {
    const real = newRecipes.filter(r => !r.isDemo);
    setRecipes(newRecipes);
    saveUserData(token, real, newCats ?? customCats);
  };

  const persistCats = newCats => {
    setCustomCats(newCats);
    saveUserData(token, recipes.filter(r => !r.isDemo), newCats);
  };

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setScanError(null); setScanning(true); setView("scan");
    try {
      const base64 = await fileToBase64(file);
      const result = await extractAndCategorize(base64, file.type, token, allCategories);
      setPending({ id: Date.now().toString(), ...result, imageBase64: base64, imageType: file.type, createdAt: new Date().toISOString() });
      setView("library");
    } catch (err) { setScanError("שגיאה: " + err.message); }
    finally { setScanning(false); }
  }, [token, allCategories]);

  const handleDrop = useCallback(e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  const confirmRecipe = (title, cats, imgB64, imgType) => {
    const recipe  = { ...pendingRecipe, title, categories: cats, imageBase64: imgB64, imageType: imgType };
    const updated = [recipe, ...recipes.filter(r => !r.isDemo)];
    persist(updated); setSelected(recipe); setPending(null); setView("detail");
  };

  const deleteRecipe = id => {
    const updated = recipes.filter(r => r.id !== id);
    const rem     = updated.length > 0 ? updated : [DEMO_RECIPE];
    persist(rem); setSelected(rem[0]); setView("detail");
  };

  const deleteIngredient = (rid, i) => {
    const upd = recipes.map(r => r.id!==rid ? r : { ...r, ingredients: r.ingredients.filter((_,j)=>j!==i) });
    persist(upd); setSelected(p => ({ ...p, ingredients: p.ingredients.filter((_,j)=>j!==i) }));
  };

  const editIngredient = (rid, i, val) => {
    const upd = recipes.map(r => r.id!==rid ? r : { ...r, ingredients: r.ingredients.map((x,j)=>j===i?val:x) });
    persist(upd); setSelected(p => ({ ...p, ingredients: p.ingredients.map((x,j)=>j===i?val:x) }));
  };

  const deleteInstruction = (rid, i) => {
    const upd = recipes.map(r => r.id!==rid ? r : { ...r, instructions: r.instructions.filter((_,j)=>j!==i) });
    persist(upd); setSelected(p => ({ ...p, instructions: p.instructions.filter((_,j)=>j!==i) }));
  };

  const editInstruction = (rid, i, val) => {
    const upd = recipes.map(r => r.id!==rid ? r : { ...r, instructions: r.instructions.map((x,j)=>j===i?val:x) });
    persist(upd); setSelected(p => ({ ...p, instructions: p.instructions.map((x,j)=>j===i?val:x) }));
  };

  const saveCategories = (rid, cats) => {
    const upd = recipes.map(r => r.id!==rid ? r : { ...r, categories: cats });
    persist(upd); setSelected(p => ({ ...p, categories: cats })); setEditCatFor(null);
  };

  const saveTitle = (rid) => {
    const upd = recipes.map(r => r.id!==rid ? r : { ...r, title: editTitleVal });
    persist(upd); setSelected(p => ({ ...p, title: editTitleVal })); setEditTitleFor(null);
  };

  const realRecipes = recipes.filter(r => !r.isDemo);
  const filtered    = realRecipes.filter(r => {
    const matchCat    = filterCat==="all" || (r.categories||[]).includes(filterCat);
    const matchSearch = !searchTerm || r.title?.includes(searchTerm);
    return matchCat && matchSearch;
  });

  // Styles
  const S = {
    app:  { minHeight:"100svh", background:"linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)", fontFamily:"'Segoe UI',Tahoma,sans-serif", direction:"rtl", color:"#e8e8f0", display:"flex", flexDirection:"column" },
    card: { background:"rgba(255,255,255,0.06)", backdropFilter:"blur(16px)", borderRadius:"16px", border:"1px solid rgba(255,255,255,0.1)", padding:"1rem" },
    nb:   (a,col) => ({ padding:"0.4rem 0.9rem", borderRadius:"50px", border:`2px solid ${a?(col||"#f8b500"):"rgba(255,255,255,0.15)"}`, background:a?(col||"#f8b500")+"22":"transparent", color:a?(col||"#f8b500"):"#aaa", cursor:"pointer", fontWeight:600, fontSize:"0.8rem", transition:"all 0.2s", whiteSpace:"nowrap" }),
    badge:(c) => ({ display:"inline-flex", alignItems:"center", gap:"0.25rem", padding:"0.22rem 0.6rem", borderRadius:"50px", background:c.color+"22", border:`1px solid ${c.color}55`, color:c.color, fontSize:"0.72rem", fontWeight:700 }),
    inp:  { padding:"0.7rem 1rem", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#e8e8f0", fontSize:"1rem", outline:"none", direction:"rtl", width:"100%" },
    del:  { padding:"0.4rem 0.8rem", borderRadius:"10px", border:"1px solid #EF444455", background:"rgba(239,68,68,0.1)", color:"#EF4444", fontWeight:600, cursor:"pointer", fontSize:"0.82rem" },
    rc:   { background:"rgba(255,255,255,0.06)", backdropFilter:"blur(16px)", borderRadius:"16px", border:"1px solid rgba(255,255,255,0.1)", overflow:"hidden", cursor:"pointer", transition:"transform 0.2s,box-shadow 0.2s" },
  };

  const FileInput = () => <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />;

  if (loading) return (
    <div style={{ minHeight:"100svh", background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"1rem", color:"#f8b500" }}>
      <div style={{ fontSize:"3rem" }}>🍽️</div>
      <p>טוען מתכונים...</p>
    </div>
  );

  // ── SHARED MODALS ──────────────────────────
  const Modals = () => <>
    {showCatMgr && <CategoryManager customCats={customCats} onSave={persistCats} onClose={() => setShowCatMgr(false)} />}
    {editCatFor && <EditCategoriesModal recipe={editCatFor} allCategories={allCategories} onSave={cats => saveCategories(editCatFor.id, cats)} onClose={() => setEditCatFor(null)} />}
    {editTitleFor && (
      <Modal onClose={() => setEditTitleFor(null)}>
        <h2 style={{ color:"#f8b500", marginBottom:"1rem" }}>✏️ ערוך שם מתכון</h2>
        <input value={editTitleVal} onChange={e => setEditTitleVal(e.target.value)} dir="rtl" autoFocus
          style={{ width:"100%", padding:"0.85rem 1rem", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.08)", color:"#e8e8f0", fontSize:"1rem", outline:"none", marginBottom:"1rem", boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:"0.7rem" }}>
          <button onClick={() => setEditTitleFor(null)} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.15)", background:"transparent", color:"#aaa", fontWeight:600, cursor:"pointer" }}>ביטול</button>
          <button onClick={() => saveTitle(editTitleFor)} style={{ flex:1, padding:"0.7rem", borderRadius:"12px", border:"none", background:"linear-gradient(135deg,#f8b500,#ff9500)", color:"#1a1a2e", fontWeight:800, cursor:"pointer" }}>✓ שמור</button>
        </div>
      </Modal>
    )}
  </>;

  // ── BOTTOM NAV ─────────────────────────────
  const BottomNav = () => (
    <nav className="bottom-nav">
      <button className={`bottom-nav-btn ${view==="library"?"active":""}`} onClick={() => setView("library")}>
        <span className="icon">📚</span>ספרייה
      </button>
      <button className="bottom-nav-btn" onClick={() => fileRef.current?.click()}>
        <span className="icon">➕</span>סרוק
      </button>
      <button className={`bottom-nav-btn ${showCatMgr?"active":""}`} onClick={() => setShowCatMgr(true)}>
        <span className="icon">🏷️</span>קטגוריות
      </button>
      <button className="bottom-nav-btn" onClick={onLogout}>
        <span className="icon">👤</span>{session.username}
      </button>
    </nav>
  );

  // ── SCAN VIEW ──────────────────────────────
  if (view === "scan") return (
    <div style={S.app}>
      <header className="app-header">
        <span className="app-logo">🍽️ מתכונים שלי</span>
      </header>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem" }}>
        <div style={{ textAlign:"center" }}>
          {scanning ? <>
            <div style={{ fontSize:"3rem", marginBottom:"1rem" }}>🔍</div>
            <p style={{ fontSize:"1.2rem", color:"#f8b500", marginBottom:"0.5rem" }}>מעבד את המתכון...</p>
            <p style={{ color:"#aaa", fontSize:"0.9rem" }}>מזהה טקסט עברי ומסווג בקטגוריות</p>
          </> : scanError && <>
            <p style={{ color:"#EF4444", fontSize:"1rem", marginBottom:"1rem" }}>{scanError}</p>
            <button style={S.del} onClick={() => setView("library")}>חזרה לספרייה</button>
          </>}
        </div>
      </div>
      <FileInput />
      <BottomNav />
    </div>
  );

  // ── DETAIL VIEW ────────────────────────────
  if (view === "detail" && selectedRecipe) {
    const cats = getCats(selectedRecipe.categories);
    return (
      <div style={S.app}>
        <Modals />
        <header className="app-header">
          <button onClick={() => setView("library")} style={{ background:"none", border:"none", color:"#f8b500", fontSize:"1.4rem", cursor:"pointer", padding:"0.2rem 0.4rem" }}>←</button>
          <span className="app-logo" style={{ flex:1, textAlign:"center" }}>{selectedRecipe.title.length > 18 ? selectedRecipe.title.slice(0,18)+"…" : selectedRecipe.title}</span>
          {!selectedRecipe.isDemo && (
            <div style={{ display:"flex", gap:"0.3rem" }}>
              <button style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"8px", color:"#10B981", fontSize:"1rem", padding:"0.3rem 0.5rem", cursor:"pointer" }} onClick={() => setEditCatFor(selectedRecipe)}>🏷️</button>
              <button style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"8px", color:"#60A5FA", fontSize:"1rem", padding:"0.3rem 0.5rem", cursor:"pointer" }} onClick={() => { setEditTitleFor(selectedRecipe.id); setEditTitleVal(selectedRecipe.title); }}>✏️</button>
              <button style={{ background:"none", border:"1px solid rgba(239,68,68,0.3)", borderRadius:"8px", color:"#EF4444", fontSize:"1rem", padding:"0.3rem 0.5rem", cursor:"pointer" }} onClick={() => deleteRecipe(selectedRecipe.id)}>🗑️</button>
            </div>
          )}
        </header>
        <div className="app-main">
          {selectedRecipe.isDemo && (
            <div style={{ background:"rgba(248,181,0,0.08)", border:"1px solid rgba(248,181,0,0.25)", borderRadius:"12px", padding:"0.6rem 1rem", marginBottom:"1rem", fontSize:"0.85rem", color:"#f8b500" }}>
              👋 זהו מתכון לדוגמה — לחץ ➕ להעלאת תמונה!
            </div>
          )}
          <div className="detail-grid">
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", marginBottom:"0.8rem", flexWrap:"wrap" }}>
                {cats.map(cat => <span key={cat.id} style={S.badge(cat)}>{cat.emoji} {cat.label}</span>)}
                {selectedRecipe.prepTime && <span style={{ color:"#aaa", fontSize:"0.78rem" }}>⏱ {selectedRecipe.prepTime}</span>}
                {selectedRecipe.cookTime && <span style={{ color:"#aaa", fontSize:"0.78rem" }}>🔥 {selectedRecipe.cookTime}</span>}
                {selectedRecipe.servings && <span style={{ color:"#aaa", fontSize:"0.78rem" }}>👥 {selectedRecipe.servings}</span>}
              </div>
              <h1 style={{ fontSize:"1.5rem", fontWeight:800, marginBottom:"1.2rem", lineHeight:1.2 }}>{selectedRecipe.title}</h1>
              {selectedRecipe.imageBase64 && (
                <div style={{ marginBottom:"1rem" }} className="mobile-img">
                  <img src={`data:${selectedRecipe.imageType};base64,${selectedRecipe.imageBase64}`} alt="מקור" style={{ width:"100%", borderRadius:"16px", boxShadow:"0 8px 40px #0008", border:"1px solid rgba(255,255,255,0.1)" }} />
                </div>
              )}
              {selectedRecipe.ingredients?.length > 0 && (
                <div style={{ ...S.card, marginBottom:"1rem" }}>
                  <h3 style={{ color:"#f8b500", marginBottom:"0.7rem", fontSize:"1rem" }}>🧺 מצרכים</h3>
                  <ul style={{ margin:0, padding:0, listStyle:"none" }}>
                    {selectedRecipe.ingredients.map((ing,i) => (
                      <li key={i} style={{ padding:"0.35rem 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                        <EditableLineItem
                          text={ing} bullet="•"
                          onSave={val => editIngredient(selectedRecipe.id, i, val)}
                          onDelete={() => deleteIngredient(selectedRecipe.id, i)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedRecipe.instructions?.length > 0 && (
                <div style={{ ...S.card, marginBottom:"1rem" }}>
                  <h3 style={{ color:"#f8b500", marginBottom:"0.7rem", fontSize:"1rem" }}>👨‍🍳 הוראות הכנה</h3>
                  <ol style={{ margin:0, padding:"0 1.2rem", direction:"rtl" }}>
                    {selectedRecipe.instructions.map((step,i) => (
                      <li key={i} style={{ padding:"0.35rem 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                        <EditableLineItem
                          text={step}
                          onSave={val => editInstruction(selectedRecipe.id, i, val)}
                          onDelete={() => deleteInstruction(selectedRecipe.id, i)} />
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {selectedRecipe.notes && (
                <div style={{ ...S.card, background:"rgba(248,181,0,0.06)", borderColor:"rgba(248,181,0,0.2)", marginBottom:"1rem" }}>
                  <h3 style={{ color:"#f8b500", marginBottom:"0.5rem", fontSize:"1rem" }}>📝 הערות</h3>
                  <p style={{ margin:0, lineHeight:1.6, fontSize:"0.95rem" }}>{selectedRecipe.notes}</p>
                </div>
              )}
            </div>
            {selectedRecipe.imageBase64 && (
              <div className="desktop-img">
                <img src={`data:${selectedRecipe.imageType};base64,${selectedRecipe.imageBase64}`} alt="מקור" style={{ width:"100%", borderRadius:"20px", boxShadow:"0 8px 40px #0008", border:"1px solid rgba(255,255,255,0.1)" }} />
                <p style={{ color:"#666", fontSize:"0.75rem", textAlign:"center", marginTop:"0.5rem" }}>נוסף: {new Date(selectedRecipe.createdAt).toLocaleDateString("he-IL")}</p>
              </div>
            )}
          </div>
        </div>
        <FileInput />
        <BottomNav />
      </div>
    );
  }

  // ── LIBRARY VIEW ───────────────────────────
  return (
    <div style={S.app}>
      <Modals />
      {pendingRecipe && <ConfirmModal recipe={pendingRecipe} allCategories={allCategories} onConfirm={confirmRecipe} onClose={() => setPending(null)} />}
      <header className="app-header">
        <span className="app-logo">🍽️ מתכונים שלי</span>
        <span style={{ color:"#888", fontSize:"0.8rem" }}>שלום, <strong style={{ color:"#f8b500" }}>{session.username}</strong></span>
      </header>
      <div className="app-main">
        <div className={`upload-zone${dragOver?" drag-over":""}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileRef.current?.click()}>
          <div style={{ fontSize:"2rem", marginBottom:"0.5rem" }}>📸</div>
          <p style={{ fontSize:"0.95rem", fontWeight:700, marginBottom:"0.2rem" }}>לחץ לסריקת מתכון</p>
          <p style={{ color:"#888", fontSize:"0.8rem" }}>תומך בעברית • מסווג אוטומטית</p>
        </div>
        {realRecipes.length > 0 && (
          <>
            <div className="filter-bar">
              <input style={S.inp} placeholder="🔍 חפש מתכון..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
              <div className="filter-cats">
                <button style={{ ...S.nb(filterCat==="all"), fontSize:"0.75rem", padding:"0.28rem 0.75rem", flexShrink:0 }} onClick={()=>setFilterCat("all")}>הכל</button>
                {allCategories.filter(c => realRecipes.some(r=>(r.categories||[]).includes(c.id))).map(cat => (
                  <button key={cat.id} style={{ ...S.nb(filterCat===cat.id, cat.color), fontSize:"0.75rem", padding:"0.28rem 0.75rem", flexShrink:0 }} onClick={()=>setFilterCat(cat.id)}>{cat.emoji} {cat.label}</button>
                ))}
              </div>
            </div>
            <div className="recipe-grid">
              {filtered.map(recipe => {
                const cats = getCats(recipe.categories);
                return (
                  <div key={recipe.id} style={S.rc} onClick={()=>{setSelected(recipe);setView("detail");}}>
                    {recipe.imageBase64 && <div style={{ height:120, overflow:"hidden" }}><img src={`data:${recipe.imageType};base64,${recipe.imageBase64}`} alt={recipe.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} /></div>}
                    <div style={{ padding:"0.75rem" }}>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"0.25rem", marginBottom:"0.4rem" }}>
                        {cats.slice(0,2).map(cat => <span key={cat.id} style={S.badge(cat)}>{cat.emoji} {cat.label}</span>)}
                      </div>
                      <h3 style={{ margin:"0.2rem 0", fontSize:"0.9rem", fontWeight:700, lineHeight:1.3 }}>{recipe.title}</h3>
                      <p style={{ color:"#666", fontSize:"0.72rem", margin:0 }}>{new Date(recipe.createdAt).toLocaleDateString("he-IL")}{recipe.servings?` · ${recipe.servings}`:""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length===0 && <div style={{ textAlign:"center", color:"#666", padding:"2rem" }}><div style={{ fontSize:"2rem" }}>🔍</div><p>לא נמצאו מתכונים</p></div>}
          </>
        )}
        {realRecipes.length===0 && <div style={{ textAlign:"center", color:"#555", padding:"2rem" }}><div style={{ fontSize:"3rem", marginBottom:"0.8rem" }}>🍴</div><p>עדיין אין מתכונים. לחץ ➕ להתחיל!</p></div>}
      </div>
      <FileInput />
      <BottomNav />
    </div>
  );
}
