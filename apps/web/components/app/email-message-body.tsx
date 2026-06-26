"use client";

import { useEffect, useState } from "react";

type EmailMessageBodyProps = {
  bodyHtml?: string | null;
  body?: string | null;
  snippet?: string | null;
  className?: string;
};

const PURIFY_OPTIONS = {
  ADD_ATTR: ["target", "rel"] as string[],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export function EmailMessageBody({ bodyHtml, body, snippet, className }: EmailMessageBodyProps) {
  const plain = body?.trim() || snippet?.trim() || "(No content)";
  const htmlClass = className ? `thread-email-html-body ${className}` : "thread-email-html-body";
  const [sanitized, setSanitized] = useState<string | null>(null);

  useEffect(() => {
    const html = bodyHtml?.trim();
    if (!html) {
      setSanitized(null);
      return;
    }

    let cancelled = false;
    void import("isomorphic-dompurify").then(({ default: DOMPurify }) => {
      if (cancelled) return;
      setSanitized(DOMPurify.sanitize(html, PURIFY_OPTIONS));
    });

    return () => {
      cancelled = true;
    };
  }, [bodyHtml]);

  if (bodyHtml?.trim()) {
    if (!sanitized) {
      return <div className={htmlClass}>{plain}</div>;
    }

    return (
      <div className={htmlClass} dangerouslySetInnerHTML={{ __html: sanitized }} />
    );
  }

  return <div className={className ?? "qship-inbox-msg-body"}>{plain}</div>;
}
