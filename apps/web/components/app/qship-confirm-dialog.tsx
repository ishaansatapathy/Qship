"use client";

import { Loader2 } from "lucide-react";

export function QshipConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="qship-modal-backdrop qship-modal-backdrop--confirm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="qship-modal qship-cal-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="qship-confirm-title"
        aria-describedby="qship-confirm-desc"
      >
        <div className="qship-cal-event-detail">
          <div className="qship-cal-event-detail-copy">
            <h3 id="qship-confirm-title" className="qship-cal-confirm-title">
              {title}
            </h3>
            <p id="qship-confirm-desc" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>
              {description}
            </p>
          </div>
        </div>
        <div className="qship-modal-actions">
          <button type="button" className="qship-btn-ghost" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "qship-btn-accent qship-cal-event-delete-confirm" : "qship-btn-accent"}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="qship-spin" /> Working…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
