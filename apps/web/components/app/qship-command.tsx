"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Settings,
  PenLine,
  ListChecks,
  CornerDownLeft,
  Bot,
  BarChart2,
  Keyboard,
  Sun,
  Rocket,
  Kanban,
  Github,
  Inbox,
  CreditCard,
} from "lucide-react";

type CommandAction = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: typeof Rocket;
  run: () => void;
};

export function QshipCommand({
  open,
  onClose,
  onShowShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  onShowShortcuts?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = useMemo<CommandAction[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      onClose();
    };
    return [
      { id: "brief", group: "Navigate", label: "Pipeline overview", icon: Sun, run: go("/brief") },
      { id: "requests", group: "Navigate", label: "Feature requests", icon: Rocket, run: go("/requests") },
      { id: "tasks", group: "Navigate", label: "Engineering board", icon: Kanban, run: go("/tasks") },
      { id: "inbox", group: "Navigate", label: "Intake hub", icon: Inbox, run: go("/inbox") },
      { id: "agent", group: "Navigate", label: "Qship Agent", icon: Bot, run: go("/agent") },
      { id: "analytics", group: "Navigate", label: "Analytics", icon: BarChart2, run: go("/analytics") },
      { id: "billing", group: "Navigate", label: "Billing & plans", icon: CreditCard, run: go("/billing") },
      { id: "settings", group: "Navigate", label: "Settings", icon: Settings, run: go("/settings") },
      { id: "compose", group: "Actions", label: "New feature request", icon: PenLine, run: go("/requests") },
      { id: "prd", group: "Actions", label: "Generate PRD with agent", hint: "Agent", icon: Bot, run: go("/agent") },
      { id: "review", group: "Actions", label: "Run AI code review", hint: "Agent", icon: ListChecks, run: go("/agent") },
      { id: "github", group: "Actions", label: "Connect GitHub", icon: Github, run: go("/settings") },
      { id: "kbd-cmd", group: "Shortcuts", label: "Open command palette", hint: "Ctrl+K", icon: Search, run: onClose },
      { id: "kbd-help", group: "Shortcuts", label: "Keyboard shortcuts", hint: "?", icon: Keyboard, run: () => { onClose(); onShowShortcuts?.(); } },
    ];
  }, [router, onClose, onShowShortcuts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q));
  }, [actions, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandAction[]>();
    for (const action of filtered) {
      const list = map.get(action.group) ?? [];
      list.push(action);
      map.set(action.group, list);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % filtered.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + filtered.length) % filtered.length);
      }
      if (e.key === "Enter" && filtered[active]) {
        e.preventDefault();
        filtered[active].run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div className="qship-cmdk-overlay" onClick={onClose} role="presentation">
      <div className="qship-cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="qship-cmdk-input">
          <Search size={15} style={{ color: "var(--qship-dim)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="qship-app-kbd">esc</kbd>
        </div>
        <div className="qship-cmdk-list">
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <div className="qship-cmdk-group">{group}</div>
              {items.map((action) => {
                flatIndex += 1;
                const i = flatIndex;
                return (
                  <button
                    key={action.id}
                    type="button"
                    className="qship-cmdk-item"
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={action.run}
                  >
                    <action.icon size={15} />
                    <span style={{ flex: 1 }}>{action.label}</span>
                    {action.hint ? <span className="qship-cmdk-item-hint">{action.hint}</span> : null}
                    {i === active ? <CornerDownLeft size={13} style={{ opacity: 0.5 }} /> : null}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="qship-cmdk-empty">No matching commands</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
