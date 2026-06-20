import React from "react";

export default function CoordinatorModal({ data, onClose }) {
  if (!data) return null;

  const { action, coordinator, key, replicas } = data;
  const isWrite = action === "write";

  const overlay = {
    position: "fixed", inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.92)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(6px)",
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
  };

  const modal = {
    background: "#080810",
    border: "1px solid rgba(106,247,184,0.25)",
    borderLeft: "3px solid #6af7b8",
    borderRadius: 12,
    padding: "24px 26px",
    width: "min(96vw, 700px)",
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  };

  const ACCENT = "#6af7b8";

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 8, flexShrink: 0,
            background: "rgba(106,247,184,0.1)", border: "1px solid rgba(106,247,184,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            📍
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>
              COORDINATOR VS REPLICA
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
              Why did the {isWrite ? "data go to" : "read request get routed to"} {replicas.join(", ")} when you clicked {coordinator}?
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 18, padding: 0,
          }}>✕</button>
        </div>

        {/* ── Explanation ── */}
        <div style={{
          background: "rgba(106,247,184,0.05)", border: "1px solid rgba(106,247,184,0.2)",
          borderRadius: 7, padding: "14px 16px",
          fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.8,
        }}>
          In Cassandra, <strong>you cannot choose where data is stored</strong>. Every node acts as a gateway (Coordinator) but the system uses mathematics to determine exactly which nodes store the data (Replicas).
          <br /><br />
          Here is exactly what just happened:
        </div>

        {/* ── Steps ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(250,204,21,0.2)", border: "1px solid #facc15",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#facc15",
            }}>1</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#facc15", marginBottom: 2 }}>You contacted {coordinator}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                You chose <strong>{coordinator}</strong> as the Coordinator. It accepted your request to {isWrite ? "write" : "read"} the key <strong>"{key}"</strong>.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(32,178,170,0.2)", border: "1px solid #20B2AA",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#20B2AA",
            }}>2</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#20B2AA", marginBottom: 2 }}>The Coordinator Hashed the Key</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                {coordinator} used the Murmur3 algorithm to mathematically convert the word "{key}" into a Token number. 
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(106,247,184,0.2)", border: "1px solid #6af7b8",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#6af7b8",
            }}>3</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6af7b8", marginBottom: 2 }}>Routed to the Replicas</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                {coordinator} checked the ring and saw that <strong>{replicas.join(", ")}</strong> owns that specific Token. It instantly forwarded your {isWrite ? "data" : "read request"} to {replicas.join(", ")}.
              </div>
            </div>
          </div>
        </div>

        {/* ── Call to action ── */}
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginTop: 4,
          background: "rgba(247,198,106,0.08)", border: "1px solid rgba(247,198,106,0.2)",
          fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.7,
        }}>
          💡 <strong>Experiment:</strong> Close this popup, select a completely different Coordinator node, and {isWrite ? "write" : "read"} the exact same key "<strong>{key}</strong>". You'll see that no matter which node you connect to, the data <strong>always</strong> ends up going to {replicas.join(", ")}!
        </div>

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button onClick={onClose} style={{
            fontFamily: "inherit", fontSize: 10, padding: "7px 16px",
            borderRadius: 6, border: "1px solid rgba(106,247,184,0.4)",
            background: "rgba(106,247,184,0.08)", color: "#6af7b8", cursor: "pointer",
          }}>Got it!</button>
        </div>
      </div>
    </div>
  );
}
