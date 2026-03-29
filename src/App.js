import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Helpers ───────────────────────────────────────────────────────────────
const b64 = (email, token) => btoa(`${email}:${token}`);

const jiraFetch = async (path, opts = {}) => {
  const params = new URLSearchParams({ path: encodeURIComponent(path) });
  const res = await fetch(`/api/jira?${params}`, {
    ...opts,
    headers: {
      "Accept": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jira ${res.status}: ${err}`);
  }
  return res.json();
};

const PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"];
const ISSUE_TYPES = ["Bug", "Task", "Story", "Improvement"];

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: t.type === "error" ? "#ff3b3b" : t.type === "success" ? "#00e676" : "#1e1e1e",
            color: t.type === "success" ? "#000" : "#fff",
            padding: "12px 18px",
            borderRadius: 6,
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            maxWidth: 320,
            borderLeft: `4px solid ${t.type === "error" ? "#ff0000" : t.type === "success" ? "#00c853" : "#555"}`,
            animation: "slideIn 0.2s ease",
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Settings Panel ─────────────────────────────────────────────────────────
function Settings({ cfg, onSave, onClose }) {
  const [form, setForm] = useState(cfg);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: 32, width: "min(480px, 96vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>⚙ CONFIG</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {[
          { key: "baseUrl", label: "Jira Base URL", placeholder: "https://yourco.atlassian.net" },
          { key: "email", label: "Email", placeholder: "you@company.com" },
          { key: "token", label: "API Token", placeholder: "••••••••••••••", type: "password" },
          { key: "projectKey", label: "Project Key", placeholder: "BUG, DEV, etc." },
          { key: "manualSprintId", label: "Sprint ID (optional fallback)", placeholder: "e.g. 1, 2, 3" },
        ].map(({ key, label, placeholder, type }) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <label style={{ display: "block", color: "#888", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" }}>{label}</label>
            <input
              type={type || "text"}
              value={form[key] || ""}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 6, padding: "10px 12px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        ))}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", color: "#888", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" }}>Default Issue Type</label>
          <select
            value={form.defaultIssueType || "Bug"}
            onChange={(e) => set("defaultIssueType", e.target.value)}
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 6, padding: "10px 12px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, outline: "none" }}
          >
            {ISSUE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button
          onClick={() => onSave(form)}
          style={{ width: "100%", background: "#ffe600", border: "none", borderRadius: 6, padding: "12px 0", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14, color: "#000", cursor: "pointer", letterSpacing: 1 }}
        >
          SAVE CONFIG
        </button>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [cfg, setCfg] = useState({ baseUrl: "", email: "", token: "", projectKey: "", defaultIssueType: "Bug" });
  const [showSettings, setShowSettings] = useState(false);
  const [sprints, setSprints] = useState([]);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { key, url }
  const [toasts, setToasts] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const [form, setForm] = useState({
    summary: "",
    description: "",
    priority: "High",
    issueType: "Bug",
    sprintId: "",
  });

  const toast = useCallback((msg, type = "info", duration = 4000) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  // Load config from storage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("jira-cfg"));
      if (saved) {
        setCfg(saved);
        setForm((f) => ({ ...f, issueType: saved.defaultIssueType || "Bug" }));
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch sprints on load
  useEffect(() => {
    fetchSprints();
  }, []);

  const fetchSprints = async () => {
    setLoadingSprints(true);
    try {
      // Get project key from server env
      const cfgRes = await fetch("/api/jira?getConfig=1");
      const cfgData = await cfgRes.json();
      const projectKey = cfgData.projectKey || cfg.projectKey;
      if (!projectKey) { setLoadingSprints(false); return; }
      setCfg((c) => ({ ...c, projectKey }));
      const boards = await jiraFetch(`/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`);
      if (!boards.values?.length) {
        // Try kanban
        const kb = await jiraFetch(`/agile/1.0/board?projectKeyOrId=${projectKey}`);
        if (!kb.values?.length) { toast("No boards found for this project", "error"); setLoadingSprints(false); return; }
        const boardId = kb.values[0].id;
        await loadSprintsForBoard(boardId);
      } else {
        await loadSprintsForBoard(boards.values[0].id);
      }
    } catch (e) {
      toast(`Could not load sprints: ${e.message}. Use manual Sprint ID in config.`, "error");
      if (cfg.manualSprintId) setForm((f) => ({ ...f, sprintId: cfg.manualSprintId }));
    }
    setLoadingSprints(false);
  };

  const loadSprintsForBoard = async (boardId) => {
    const res = await jiraFetch(`/agile/1.0/board/${boardId}/sprint?state=active,future`);
    const list = res.values || [];
    setSprints(list);
    const active = list.find((s) => s.state === "active");
    if (active) setForm((f) => ({ ...f, sprintId: String(active.id) }));
  };

  const saveCfg = (newCfg) => {
    setCfg(newCfg);
    setForm((f) => ({ ...f, issueType: newCfg.defaultIssueType || "Bug" }));
    localStorage.setItem("jira-cfg", JSON.stringify(newCfg));
    setShowSettings(false);
    toast("Config saved!", "success");
  };

  const handleFiles = (files) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith("image/") || f.size < 20 * 1024 * 1024);
    setScreenshots((s) => [...s, ...valid]);
  };

  const submit = async () => {
    if (!form.summary.trim()) { toast("Summary is required", "error"); return; }
    if (!cfg.baseUrl || !cfg.token) { toast("Configure Jira first", "error"); setShowSettings(true); return; }
    setSubmitting(true);
    try {
      // Build fields
      const fields = {
        project: { key: cfg.projectKey },
        summary: form.summary.trim(),
        description: {
          version: 1, type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: form.description || " " }] }],
        },
        issuetype: { name: form.issueType },
        priority: { name: form.priority },
      };

      // Add sprint if selected
      if (form.sprintId) {
        fields.customfield_10020 = parseInt(form.sprintId, 10);
      }

      const created = await jiraFetch("/api/3/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });

      // Upload screenshots
      if (screenshots.length) {
        for (const file of screenshots) {
          const fd = new FormData();
          fd.append("file", file);
          const attachParams = new URLSearchParams({
            path: encodeURIComponent(`/api/3/issue/${created.key}/attachments`),
          });
          await fetch(`/api/jira?${attachParams}`, {
            method: "POST",
            headers: { "X-Atlassian-Token": "no-check" },
            body: fd,
          });
        }
      }

      setSubmitted({ key: created.key, url: `${cfg.baseUrl}/browse/${created.key}` });
      toast(`✓ ${created.key} created!`, "success", 6000);
      setForm({ summary: "", description: "", priority: "High", issueType: cfg.defaultIssueType || "Bug", sprintId: form.sprintId });
      setScreenshots([]);
    } catch (e) {
      toast(`Failed: ${e.message}`, "error", 8000);
    }
    setSubmitting(false);
  };

  const isReady = true;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; }
        @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes fadeUp { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        textarea::-webkit-scrollbar { width: 4px; }
        textarea::-webkit-scrollbar-track { background: transparent; }
        textarea::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: #444; }
        select option { background: #111; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Mono', monospace", padding: "0 0 80px" }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid #1a1a1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isReady ? "#00e676" : "#ff3b3b", animation: isReady ? "none" : "pulse 1.5s infinite" }} />
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>
              BUG<span style={{ color: "#ffe600" }}>SHOT</span>
            </span>
            {cfg.projectKey && (
              <span style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", padding: "2px 10px", borderRadius: 4, fontSize: 11, color: "#888", letterSpacing: 1 }}>
                {cfg.projectKey}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "7px 14px", color: "#888", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: 1 }}
          >
            ⚙ CONFIG
          </button>
        </div>

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px", animation: "fadeUp 0.3s ease" }}>

          {/* Success banner */}
          {submitted && (
            <div style={{ background: "#001a00", border: "1px solid #00e676", borderRadius: 8, padding: "14px 18px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#00e676", fontSize: 13 }}>✓ Created <strong>{submitted.key}</strong></span>
              <a href={submitted.url} target="_blank" rel="noreferrer" style={{ color: "#00e676", fontSize: 12, textDecoration: "underline" }}>Open in Jira →</a>
            </div>
          )}

          {/* Summary */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>SUMMARY *</label>
            <input
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
              placeholder="What broke?"
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>DESCRIPTION</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Steps to reproduce, expected vs actual, environment..."
              rows={5}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>

          {/* Row: Priority + Issue Type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>PRIORITY</label>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} style={selectStyle}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>TYPE</label>
              <select value={form.issueType} onChange={(e) => setForm((f) => ({ ...f, issueType: e.target.value }))} style={selectStyle}>
                {ISSUE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Sprint */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>
              SPRINT
              {loadingSprints && <span style={{ color: "#555", marginLeft: 8, animation: "pulse 1s infinite" }}>loading...</span>}
            </label>
            <select value={form.sprintId} onChange={(e) => setForm((f) => ({ ...f, sprintId: e.target.value }))} style={selectStyle}>
              <option value="">— No sprint —</option>
              {sprints.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}{s.state === "active" ? " ✦ active" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Screenshot Drop Zone */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>SCREENSHOTS</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${dragging ? "#ffe600" : "#2a2a2a"}`,
                borderRadius: 8,
                padding: "20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "border-color 0.2s",
                background: dragging ? "#1a1600" : "transparent",
              }}
            >
              <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
              {screenshots.length === 0 ? (
                <span style={{ color: "#444", fontSize: 13 }}>Drop screenshots here or tap to select</span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                  {screenshots.map((f, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img
                        src={URL.createObjectURL(f)}
                        style={{ height: 72, borderRadius: 6, border: "1px solid #2a2a2a", objectFit: "cover", maxWidth: 120 }}
                        alt=""
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setScreenshots((s) => s.filter((_, j) => j !== i)); }}
                        style={{ position: "absolute", top: -6, right: -6, background: "#ff3b3b", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >✕</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", color: "#555", fontSize: 12 }}>+ add more</div>
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={submit}
            disabled={submitting || !isReady}
            style={{
              width: "100%",
              background: submitting ? "#332e00" : "#ffe600",
              border: "none",
              borderRadius: 8,
              padding: "15px 0",
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 16,
              color: submitting ? "#888" : "#000",
              cursor: submitting ? "not-allowed" : "pointer",
              letterSpacing: 0.5,
              transition: "all 0.2s",
            }}
          >
            {submitting ? "FILING BUG..." : `FILE BUG ${screenshots.length ? `+ ${screenshots.length} SCREENSHOT${screenshots.length > 1 ? "S" : ""}` : ""}`}
          </button>

          <div style={{ marginTop: 10, textAlign: "center", color: "#333", fontSize: 11 }}>
            ⌘/Ctrl + Enter to submit
          </div>
        </div>
      </div>

      {showSettings && <Settings cfg={cfg} onSave={saveCfg} onClose={() => setShowSettings(false)} />}
      <Toast toasts={toasts} />
    </>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  background: "#111",
  border: "1px solid #222",
  borderRadius: 7,
  padding: "11px 14px",
  color: "#e8e8e8",
  fontFamily: "'DM Mono', monospace",
  fontSize: 14,
  outline: "none",
};

const selectStyle = {
  ...inputStyle,
  appearance: "none",
  cursor: "pointer",
};

const labelStyle = {
  display: "block",
  color: "#555",
  fontSize: 10,
  letterSpacing: 2,
  textTransform: "uppercase",
  marginBottom: 7,
};
