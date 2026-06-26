"use client";

const SHORTCUTS = [
  { keys: "Ctrl+K", action: "Open command palette" },
  { keys: "?", action: "Show keyboard shortcuts" },
  { keys: "Enter", action: "Open selected item" },
  { keys: "A / D", action: "Approve / dismiss first queue item" },
  { keys: "Esc", action: "Close pane or modal" },
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="qship-cmdk-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qship-cmdk" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" style={{ maxWidth: 420 }}>
        <div className="qship-cmdk-input" style={{ borderBottom: "1px solid var(--qship-line)" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Keyboard shortcuts</span>
          <span className="qship-app-kbd">?</span>
        </div>
        <div className="qship-cmdk-list" style={{ padding: "8px 0" }}>
          {SHORTCUTS.map((row) => (
            <div
              key={row.keys}
              className="qship-cmdk-item"
              style={{ cursor: "default", justifyContent: "space-between" }}
            >
              <span>{row.action}</span>
              <kbd className="qship-app-kbd">{row.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
