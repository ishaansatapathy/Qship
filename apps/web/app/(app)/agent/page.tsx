"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bot,
  Calendar,
  CheckCircle2,
  Github,
  ListChecks,
  Loader2,
  Mail,
  Paperclip,
  PenLine,
  Rocket,
  Search,
  Sparkles,
  Square,
  Target,
} from "lucide-react";

import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";
import { AgentMentionInput } from "~/components/app/agent-mention-input";
import { AgentContextPicker } from "~/components/app/agent-context-picker";
import { AgentFocusChip, type AgentFocusState } from "~/components/app/agent-focus-chip";
import { FeatureDeliveryPanel } from "~/components/app/feature-delivery-panel";
import { fromFeatureFocusId, isFeatureFocusId } from "~/lib/shipflow-focus";
import { AgentSessionSidebar } from "~/components/app/agent-session-sidebar";
import { TaskWalkthroughPanel } from "~/components/app/task-walkthrough-panel";
import { SkeletonList } from "~/components/app/skeleton-list";
import { QueryErrorState } from "~/components/app/query-error-state";
import {
  dismissBriefFocus,
  dismissBriefFocusFromQueueItem,
  dismissBriefFocusFromAgentActions,
} from "~/lib/brief-dismissals";
import { useDemoAiGuard } from "~/components/app/demo-limit-modal";
import { useQueueIntegrationGate } from "~/components/app/connect-required-modal";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ActionCard = RouterOutputs["agent"]["chat"]["actions"][number];

type ToolMemoryEntry = {
  at: string;
  tool: string;
  summary: string;
  contextId?: string;
  eventId?: string;
  query?: string;
};

const SUGGESTIONS = [
  {
    label: "Pipeline summary",
    icon: Target,
    prompt: "Give me a summary of our feature delivery pipeline — what's submitted, in delivery, and awaiting approval?",
  },
  {
    label: "Submit feature idea",
    icon: PenLine,
    prompt:
      "I want to submit a feature: add bulk export for customer reports in CSV format. Create the request and run AI triage.",
  },
  {
    label: "End-to-end delivery",
    icon: Sparkles,
    prompt:
      "Find our most recent submitted feature request, generate a PRD, break it into engineering tasks, and run an AI review.",
  },
  {
    label: "List open requests",
    icon: ListChecks,
    prompt: "List our recent feature requests and highlight anything that needs attention.",
  },
  {
    label: "GitHub status",
    icon: Github,
    prompt: "Is GitHub connected to our workspace? List linked repositories if any.",
  },
];

const WALKTHROUGH_SUGGESTIONS = [
  { label: "Explain more", icon: Sparkles, prompt: "Explain more — full implementation detail for this task." },
  {
    label: "Next task",
    icon: CheckCircle2,
    prompt: "Mark this task done and advance to the next engineering task.",
  },
  {
    label: "Scan repo",
    icon: Github,
    prompt: "Re-run explain_engineering_task with analyzeRepo=true for the current task.",
  },
];

const SHIPFLOW_ACTION_KINDS = new Set([
  "feature_list",
  "feature_created",
  "feature_detail",
  "feature_tasks",
  "ai_review",
  "pipeline_summary",
  "github_repos",
]);

function actionIcon(kind: ActionCard["kind"]) {
  switch (kind) {
    case "feature_list":
    case "feature_created":
    case "feature_detail":
      return Rocket;
    case "feature_tasks":
      return ListChecks;
    case "ai_review":
      return Sparkles;
    case "pipeline_summary":
      return Target;
    case "github_repos":
      return Github;
    case "email_queued":
      return Mail;
    case "calendar_queued":
      return Calendar;
    case "queue_list":
      return ListChecks;
    case "inbox_ranked":
      return Sparkles;
    default:
      return Search;
  }
}

type AgentDeepLink = {
  prompt: string;
  contextId: string;
  eventId: string;
};

function readAgentDeepLink(searchParams: ReturnType<typeof useSearchParams>): AgentDeepLink {
  const fromRouter: AgentDeepLink = {
    prompt: searchParams.get("prompt")?.trim() ?? "",
    contextId: searchParams.get("focus")?.trim() ?? "",
    eventId: searchParams.get("event")?.trim() ?? "",
  };
  if (fromRouter.prompt) return fromRouter;
  if (typeof window === "undefined") return fromRouter;
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt")?.trim() ?? "";
  if (!prompt) return fromRouter;
  return {
    prompt,
    contextId: params.get("focus")?.trim() ?? "",
    eventId: params.get("event")?.trim() ?? "",
  };
}

function agentWelcomeCopy(opts: { settingsReady: boolean }) {
  if (!opts.settingsReady) {
    return "Ask about your pipeline, attach a feature, or run delivery steps. Loading settings…";
  }

  return (
    <>
      Attach a feature with 📎 for timeline + context. Ask for PRDs, tasks, reviews, or pipeline summaries in plain
      language — use <strong style={{ color: "var(--qship-text)" }}>Stop</strong> anytime to cancel a long run.
    </>
  );
}

function ActionPanel({
  actions,
  agentAutoApprove,
  onQueueResolved,
  userEmail,
}: {
  actions: ActionCard[];
  agentAutoApprove: boolean;
  onQueueResolved?: () => void;
  userEmail?: string | null;
}) {
  const utils = trpc.useUtils();
  const { checkBeforeApprove, showRequirementFromError, modal: connectModal } =
    useQueueIntegrationGate(userEmail);
  const pendingQueue = trpc.queue.list.useQuery({ status: "pending" });
  const approve = trpc.queue.approve.useMutation({
    onSuccess: async (item) => {
      dismissBriefFocusFromQueueItem(item);
      await utils.queue.list.invalidate();
      await utils.queue.pendingCount.invalidate();
      await utils.ai.dailyBrief.invalidate();
      onQueueResolved?.();
      toast.success("Approved from Agent panel");
    },
    onError: (e) => {
      void utils.queue.list.invalidate();
      if (!showRequirementFromError(e.message)) {
        toast.error(e.message);
      }
    },
  });
  const dismiss = trpc.queue.dismiss.useMutation({
    onSuccess: async () => {
      await utils.queue.list.invalidate();
      await utils.queue.pendingCount.invalidate();
      onQueueResolved?.();
      toast.success("Dismissed from Agent panel");
    },
    onError: (e) => toast.error(e.message),
  });

  if (actions.length === 0) {
    return (
      <div className="qship-agent-pane">
        <div className="qship-agent-pane-head">
          <CheckCircle2 size={14} style={{ opacity: 0.55 }} />
          Actions
        </div>
        <div className="qship-agent-feed" style={{ justifyContent: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--qship-muted)", lineHeight: 1.55, textAlign: "center" }}>
            {agentAutoApprove ? (
              <>
                Agent PRDs, reviews, and ship steps run when you ask in chat. Turn off{" "}
                <strong style={{ color: "var(--qship-text)" }}>Auto-approve agent</strong> in Settings to require
                explicit wording per action.
              </>
            ) : (
              <>
                Sensitive agent actions need a clear request in the same message (e.g. &quot;generate a PRD&quot;) — no
                second confirmation step.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  const latest =
    actions.find((a) => SHIPFLOW_ACTION_KINDS.has(a.kind)) ??
    actions.find((a) => a.kind === "inbox_ranked" || a.kind === "inbox_search") ??
    actions[actions.length - 1]!;
  const queuedAction = [...actions]
    .reverse()
    .find(
      (a) =>
        (a.kind === "email_queued" || a.kind === "calendar_queued") &&
        a.disposition === "queued" &&
        a.queueItemId,
    );
  const pendingIds = new Set((pendingQueue.data?.items ?? []).map((item: { id: string }) => item.id));
  const queuedItem = pendingQueue.data?.items.find(
    (item: { id: string }) => item.id === queuedAction?.queueItemId,
  );
  const queueItemStillPending = Boolean(
    queuedAction?.queueItemId && pendingIds.has(queuedAction.queueItemId),
  );
  const Icon = actionIcon(latest.kind);

  const handleApproveQueued = () => {
    if (!queuedAction?.queueItemId) return;
    const kind =
      queuedItem?.kind ??
      (queuedAction.kind === "calendar_queued" ? "calendar_invite" : "email_send");
    if (!checkBeforeApprove(kind)) return;
    approve.mutate({ id: queuedAction.queueItemId });
  };

  return (
    <>
    <div className="qship-agent-pane">
      <div className="qship-agent-pane-head">
        <Icon size={14} style={{ opacity: 0.7 }} />
        {latest.title}
        {latest.href ? (
          <Link href={latest.href} className="qship-mono-tag" style={{ marginLeft: "auto" }}>
            Open →
          </Link>
        ) : null}
      </div>
      <div className="qship-agent-feed">
        {latest.detail ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--qship-muted)" }}>{latest.detail}</p>
        ) : null}
        {latest.lines?.map((line) => (
          <div key={line} className="qship-agent-log-row" style={{ alignItems: "flex-start" }}>
            <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, color: "var(--qship-text)", fontFamily: "inherit", fontSize: 12.5 }}>
              {line}
            </span>
          </div>
        ))}
        {queuedAction &&
        queuedAction.disposition === "queued" ? (
          <div className="qship-inbox-banner" style={{ marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              {queueItemStillPending
                ? "Waiting in Queue — approve here or review all items."
                : "This item was already processed — open Queue for details."}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {queueItemStillPending && queuedAction.queueItemId ? (
                <>
                  <button
                    type="button"
                    className="qship-btn-accent"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                    disabled={approve.isPending || dismiss.isPending}
                    onClick={handleApproveQueued}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="qship-btn-ghost"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                    disabled={approve.isPending || dismiss.isPending}
                    onClick={() => dismiss.mutate({ id: queuedAction.queueItemId! })}
                  >
                    Dismiss
                  </button>
                </>
              ) : null}
              <Link href="/queue" className="qship-inbox-loadmore" style={{ display: "inline-flex" }}>
                Open Queue
              </Link>
            </div>
          </div>
        ) : null}
        {(latest.kind === "email_queued" || latest.kind === "calendar_queued") &&
        latest.disposition === "sent" ? (
          <div className="qship-inbox-banner" style={{ marginTop: 4, borderColor: "rgba(52, 211, 153, 0.25)" }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--qship-accent-bright)" }}>
              Sent immediately — auto-approve is on for this action type.
            </p>
          </div>
        ) : null}
        {actions.length > 1 ? (
          <div className="qship-agent-log" style={{ padding: 0, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--qship-dim)", fontFamily: "var(--qship-mono)" }}>
              {actions.length} actions this turn
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {actions.slice(0, -1).map((action, i) => {
                const ActionIcon = actionIcon(action.kind);
                return (
                  <div key={`${action.kind}-${i}`} className="qship-agent-log-row" style={{ alignItems: "center", gap: 8 }}>
                    <ActionIcon size={12} style={{ opacity: 0.55, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--qship-muted)", flex: 1 }}>{action.title}</span>
                    {action.href ? (
                      <Link href={action.href} className="qship-mono-tag" style={{ fontSize: 10 }}>
                        Open
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
    {connectModal}
    </>
  );
}

function AgentPageContent() {
  const searchParams = useSearchParams();
  const [linkParamsReady, setLinkParamsReady] = useState(false);
  const [deepLink, setDeepLink] = useState<AgentDeepLink>({
    prompt: "",
    contextId: "",
    eventId: "",
  });

  useLayoutEffect(() => {
    setDeepLink(readAgentDeepLink(searchParams));
    setLinkParamsReady(true);
  }, [searchParams]);

  const urlPrompt = deepLink.prompt;
  const urlContextId = deepLink.contextId;
  const urlEventId = deepLink.eventId;
  const urlWalkthrough = searchParams.get("walkthrough") === "1";
  const urlTaskId = searchParams.get("task")?.trim() ?? "";
  const urlAnalyzeRepo = searchParams.get("repo") === "1";
  const isDeepLink = Boolean(urlPrompt);

  const [input, setInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolMemory, setToolMemory] = useState<ToolMemoryEntry[]>([]);
  const [lastActions, setLastActions] = useState<ActionCard[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [focus, setFocus] = useState<AgentFocusState>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [activeWalkthroughTaskId, setActiveWalkthroughTaskId] = useState("");
  const [walkthroughExplain, setWalkthroughExplain] =
    useState<RouterOutputs["feature"]["explainTask"]>();
  const [walkthroughDepth, setWalkthroughDepth] = useState<"brief" | "full">("brief");
  const walkthroughPrefetched = useRef(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const promptHandled = useRef(false);
  const deepLinkHandled = useRef(false);
  const deepLinkLockRef = useRef(false);
  const sessionBootstrapping = useRef(false);

  const utils = trpc.useUtils();
  const sessionsQuery = trpc.agent.listSessions.useQuery(
    { limit: 30 },
    { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
  );
  const sessionQuery = trpc.agent.getSession.useQuery(
    { id: activeSessionId! },
    { enabled: Boolean(activeSessionId), staleTime: 0 },
  );
  const createSession = trpc.agent.createSession.useMutation();
  const updateSession = trpc.agent.updateSession.useMutation();

  const status = trpc.agent.status.useQuery({}, { retry: 1, refetchOnWindowFocus: false });
  const approvalDefaults = trpc.settings.getApprovalDefaults.useQuery({}, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  const meQuery = trpc.auth.me.useQuery({});
  const ready = status.data?.ready === true;

  const walkthroughFeatureId =
    urlWalkthrough && isFeatureFocusId(focus.contextId ?? urlContextId) ?
      fromFeatureFocusId(focus.contextId ?? urlContextId)
    : null;

  const walkthroughStateQuery = trpc.feature.getTaskWalkthroughState.useQuery(
    {
      featureId: walkthroughFeatureId!,
      currentTaskId: activeWalkthroughTaskId || undefined,
    },
    { enabled: Boolean(walkthroughFeatureId), staleTime: 5_000 },
  );

  const explainTaskMutation = trpc.feature.explainTask.useMutation({
    onSuccess: (data) => setWalkthroughExplain(data),
  });

  const refreshWalkthroughExplain = useCallback(
    async (taskId: string, depth: "brief" | "full", analyzeRepo: boolean) => {
      if (!taskId) return;
      setWalkthroughDepth(depth);
      await explainTaskMutation.mutateAsync({ taskId, depth, analyzeRepo });
    },
    [explainTaskMutation],
  );

  useEffect(() => {
    if (urlTaskId) setActiveWalkthroughTaskId(urlTaskId);
  }, [urlTaskId]);

  useEffect(() => {
    walkthroughPrefetched.current = false;
  }, [urlTaskId, urlAnalyzeRepo, walkthroughFeatureId]);

  useEffect(() => {
    if (!urlWalkthrough || !activeWalkthroughTaskId || !ready || walkthroughPrefetched.current) return;
    walkthroughPrefetched.current = true;
    void refreshWalkthroughExplain(activeWalkthroughTaskId, "brief", urlAnalyzeRepo);
  }, [urlWalkthrough, activeWalkthroughTaskId, urlAnalyzeRepo, ready, refreshWalkthroughExplain]);

  const agentAutoApprove = approvalDefaults.data?.autoApproveAgentEmail ?? false;
  const approvalSettingsReady = !approvalDefaults.isLoading && approvalDefaults.data !== undefined;

  const agentBadge = approvalSettingsReady
    ? agentAutoApprove
      ? "Agent"
      : "Confirm intent · agent"
    : status.isLoading
      ? "Connecting…"
      : status.isError
        ? "API offline"
        : ready
          ? (status.data?.model ?? "gpt-4o-mini")
          : "OpenAI not loaded on API";

  const agentPlaceholder = status.isLoading
    ? "Connecting to agent…"
    : status.isError
      ? "API unavailable — run pnpm dev and refresh"
      : ready
        ? "Ask ShipFlow Agent… e.g. triage requests or generate a PRD"
        : "Restart pnpm dev after saving OPENAI_API_KEY in .env";

  const { isDemo: isDemoUser, tryFeature, modal: demoModal } = useDemoAiGuard(meQuery.data?.email, "agent");

  // Brief / inbox deep-links: reset session bootstrap when URL params change.
  useEffect(() => {
    if (!urlPrompt) return;
    promptHandled.current = false;
    deepLinkHandled.current = false;
    deepLinkLockRef.current = true;
    setSessionReady(false);
    sessionBootstrapping.current = false;
  }, [urlPrompt, urlContextId, urlEventId]);

  const applySession = useCallback((session: NonNullable<RouterOutputs["agent"]["getSession"]>) => {
    setMessages(session.messages);
    setToolMemory(session.toolMemory);
    setFocus({
      contextId: session.focus.contextId,
      eventId: session.focus.eventId,
      contextLabel: session.focus.contextLabel,
      eventLabel: session.focus.eventLabel,
    });
  }, []);

  const startNewChat = useCallback(async (opts?: { focus?: AgentFocusState; title?: string | null }) => {
    const session = await createSession.mutateAsync({
      title: opts?.title ?? null,
      focus: opts?.focus,
    });
    setActiveSessionId(session.id);
    setMessages([]);
    setToolMemory([]);
    setLastActions([]);
    setFocus(opts?.focus ?? {});
    await utils.agent.listSessions.invalidate();
    return session.id;
  }, [createSession, utils.agent.listSessions]);

  useEffect(() => {
    if (!linkParamsReady || sessionReady || sessionsQuery.isLoading || sessionBootstrapping.current) return;

    sessionBootstrapping.current = true;
    void (async () => {
      try {
        if (isDeepLink && !deepLinkHandled.current) {
          deepLinkHandled.current = true;
          deepLinkLockRef.current = true;
          await startNewChat({
            focus: {
              contextId: urlContextId || undefined,
              eventId: urlEventId || undefined,
              walkthroughTaskId: urlTaskId || undefined,
              analyzeRepo: urlAnalyzeRepo || undefined,
            },
            title: urlPrompt.slice(0, 72) || null,
          });
          await utils.agent.listSessions.invalidate();
          return;
        }

        const sessions = sessionsQuery.data ?? [];
        if (sessions.length > 0) {
          setActiveSessionId(sessions[0]!.id);
        } else {
          await startNewChat();
        }
      } finally {
        setSessionReady(true);
        sessionBootstrapping.current = false;
      }
    })();
  }, [isDeepLink, linkParamsReady, sessionReady, sessionsQuery.data, sessionsQuery.isLoading, startNewChat, urlEventId, urlContextId, urlPrompt, utils.agent.listSessions]);

  useEffect(() => {
    if (!sessionReady || !activeSessionId || sessionsQuery.isLoading || createSession.isPending) return;
    if (sessionBootstrapping.current) return;
    // Don't hijack the fresh deep-link session before auto-prompt runs.
    if (deepLinkLockRef.current && !promptHandled.current) return;
    const sessions = sessionsQuery.data ?? [];
    if (sessions.some((s: { id: string }) => s.id === activeSessionId)) return;
    if (sessions.length > 0) {
      setActiveSessionId(sessions[0]!.id);
      return;
    }
    sessionBootstrapping.current = true;
    void startNewChat().finally(() => {
      sessionBootstrapping.current = false;
    });
  }, [activeSessionId, createSession.isPending, sessionReady, sessionsQuery.data, sessionsQuery.isLoading, startNewChat]);

  useEffect(() => {
    if (!activeSessionId || sessionQuery.isLoading || isPending) return;
    if (!sessionQuery.data) return;
    if (deepLinkLockRef.current) return;
    applySession(sessionQuery.data);
  }, [activeSessionId, applySession, isPending, sessionQuery.data, sessionQuery.isLoading]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPending, streamStatus]);

  useEffect(() => {
    return () => streamAbortRef.current?.abort();
  }, []);

  const persistFocus = async (nextFocus: AgentFocusState) => {
    if (!activeSessionId) return;
    const hasFocus = Boolean(nextFocus.contextId || nextFocus.eventId);
    await updateSession.mutateAsync({
      id: activeSessionId,
      focus: hasFocus
        ? {
            contextId: nextFocus.contextId,
            eventId: nextFocus.eventId,
            contextLabel: nextFocus.contextLabel,
            eventLabel: nextFocus.eventLabel,
          }
        : null,
    });
    await utils.agent.getSession.invalidate({ id: activeSessionId });
  };

  const stopStream = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setIsPending(false);
    setStreamStatus(null);
    toast.message("Stopped.");
  };

  const send = (text: string): boolean => {
    const message = text.trim();
    if (!message || isPending) return false;
    if (!sessionReady || !activeSessionId) {
      toast.message("Starting chat session… try again in a moment.");
      return false;
    }
    if (!ready) {
      if (status.isError) {
        toast.message("Cannot reach API — run pnpm dev and refresh the page.");
      } else if (status.isLoading) {
        toast.message("Agent still connecting… try again in a moment.");
      } else {
        toast.message("OpenAI key not loaded on API — restart pnpm dev after saving .env.");
      }
      return false;
    }

    if (isDemoUser && !tryFeature()) return false;

    streamAbortRef.current?.abort();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    setInput("");
    setLastActions([]);
    setStreamStatus(null);
    const hasFocus = Boolean(focus.contextId || focus.eventId);
    const history = hasFocus ? messages.slice(-4) : messages.slice(-12);
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsPending(true);

    fetch(`/agent/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-app-csrf": "1" },
      body: JSON.stringify({
        message,
        sessionId: activeSessionId,
        history,
        toolMemory,
        userEmail: meQuery.data?.email,
        focusCleared: !hasFocus,
        focusContextId: focus.contextId,
        focusEventId: focus.eventId,
        focusContextLabel: focus.contextLabel,
        focusEventLabel: focus.eventLabel,
        walkthroughTaskId:
          walkthroughFeatureId ? activeWalkthroughTaskId || undefined : undefined,
        analyzeRepo: walkthroughFeatureId ? urlAnalyzeRepo || undefined : undefined,
      }),
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "Agent request failed" }));
          throw new Error((err as { error?: string }).error ?? "Agent request failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              try {
                const data = JSON.parse(dataStr) as Record<string, unknown>;
                if (currentEvent === "status") {
                  setStreamStatus(String(data.label ?? "Working…"));
                } else if (currentEvent === "token") {
                  const tokenText = String(data.text ?? "");
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return [...prev.slice(0, -1), { role: "assistant", content: last.content + tokenText }];
                    }
                    return [...prev, { role: "assistant", content: tokenText }];
                  });
                } else if (currentEvent === "complete") {
                  const reply = String(data.reply ?? "");
                  const actions = (data.actions as ActionCard[]) ?? [];
                  const nextToolMemory = (data.toolMemory as ToolMemoryEntry[]) ?? toolMemory;
                  const focusCleared = Boolean(data.focusCleared);
                  const nextWalkthroughTaskId =
                    data.walkthroughTaskId === null || data.walkthroughTaskId === undefined ?
                      activeWalkthroughTaskId
                    : String(data.walkthroughTaskId ?? "");

                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return [...prev.slice(0, -1), { role: "assistant", content: reply }];
                    }
                    return [...prev, { role: "assistant", content: reply }];
                  });
                  setLastActions(actions);
                  setToolMemory(nextToolMemory);
                  if (focusCleared) {
                    setFocus({});
                  }
                  setStreamStatus(null);
                  dismissBriefFocusFromAgentActions(actions);

                  if (urlWalkthrough && nextWalkthroughTaskId) {
                    setActiveWalkthroughTaskId(nextWalkthroughTaskId);
                    const depth =
                      message.toLowerCase().includes("explain more") ? "full" : walkthroughDepth;
                    void walkthroughStateQuery.refetch();
                    void refreshWalkthroughExplain(nextWalkthroughTaskId, depth, urlAnalyzeRepo);
                  }

                  const focusedContextId = focus.contextId ?? urlContextId;
                  if (
                    focusedContextId &&
                    actions.some(
                      (a) =>
                        a.kind === "email_queued" ||
                        (a.kind === "context" && a.href?.includes(urlContextId)),
                    )
                  ) {
                    dismissBriefFocus(focusedContextId);
                  }

                  void utils.agent.listSessions.invalidate();
                  void utils.agent.getSession.invalidate({ id: activeSessionId });
                  void utils.queue.pendingCount.invalidate();
                  void utils.ai.dailyBrief.invalidate();
                } else if (currentEvent === "error") {
                  throw new Error(String(data.message ?? "Agent error"));
                }
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
              currentEvent = "";
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Agent request failed");
      })
      .finally(() => {
        if (streamAbortRef.current === abortController) {
          streamAbortRef.current = null;
        }
        setIsPending(false);
        setStreamStatus(null);
      });

    return true;
  };

  useEffect(() => {
    if (promptHandled.current) return;
    if (!linkParamsReady || !urlPrompt || !sessionReady || !activeSessionId || isPending) return;
    if (!ready) return;
    if (send(urlPrompt)) {
      promptHandled.current = true;
      deepLinkLockRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkParamsReady, urlPrompt, ready, isPending, sessionReady, activeSessionId]);

  const preparingDeepLink =
    isDeepLink &&
    linkParamsReady &&
    !promptHandled.current &&
    !isPending &&
    messages.length === 0;

  const handleSelectSession = (id: string) => {
    if (id === activeSessionId || isPending) return;
    streamAbortRef.current?.abort();
    setActiveSessionId(id);
    setLastActions([]);
  };

  const handleNewChat = async () => {
    if (isPending) return;
    await startNewChat();
  };

  const handleClearFocus = async () => {
    const next = {};
    setFocus(next);
    await persistFocus(next);
  };

  const handleAttachFocus = async (next: AgentFocusState) => {
    setFocus(next);
    await persistFocus(next);
  };

  return (
    <div className="qship-app-page">
      {demoModal}
      <div className="qship-agent-layout">
        <AgentSessionSidebar
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={() => void handleNewChat()}
          disabled={isPending || createSession.isPending}
        />

        <div className="qship-agent-page">
          <div className="qship-agent-pane">
            <div className="qship-agent-pane-head">
              <Bot size={14} style={{ opacity: 0.7 }} />
              ShipFlow Agent
              <span className="qship-mono-tag" style={{ marginLeft: "auto" }}>
                {agentBadge}
              </span>
              {isPending ? (
                <button
                  type="button"
                  className="qship-btn-ghost"
                  style={{ fontSize: 11, padding: "3px 8px", marginLeft: 6 }}
                  onClick={stopStream}
                  title="Stop current request"
                >
                  <Square size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                  Stop
                </button>
              ) : null}
            </div>

            <div className="qship-agent-feed" ref={feedRef}>
              {status.isError ? (
                <QueryErrorState
                  title="Agent unavailable"
                  message={status.error?.message ?? "Could not reach the agent service"}
                  onRetry={() => void status.refetch()}
                />
              ) : null}
              {sessionsQuery.isError ? (
                <QueryErrorState
                  title="Sessions unavailable"
                  message={sessionsQuery.error?.message ?? "Could not load chat sessions"}
                  onRetry={() => void sessionsQuery.refetch()}
                />
              ) : null}
              {(status.isLoading || !linkParamsReady) && messages.length === 0 && !preparingDeepLink ? (
                <SkeletonList count={3} />
              ) : null}
              {preparingDeepLink ? (
                <div className="qship-rotator-bubble qship-agent-msg" style={{ fontSize: 13 }}>
                  <Loader2 size={13} className="qship-spin" />
                  <span style={{ color: "var(--qship-muted)", fontStyle: "italic" }}>
                    Preparing context from overview…
                  </span>
                </div>
              ) : null}
              {messages.length === 0 && !status.isLoading && linkParamsReady && !preparingDeepLink ? (
                <div
                  className="qship-rotator-bubble"
                  data-approval={approvalSettingsReady ? (agentAutoApprove ? "on" : "off") : undefined}
                  style={{ fontSize: 13, maxWidth: "100%" }}
                >
                  <Bot size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
                  <span>{agentWelcomeCopy({ settingsReady: approvalSettingsReady })}</span>
                </div>
              ) : null}

              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className="qship-rotator-bubble qship-agent-msg"
                  data-user={msg.role === "user" ? "true" : undefined}
                  data-testid={msg.role === "assistant" ? "agent-assistant-message" : undefined}
                  style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  {msg.role === "assistant" ? <Bot size={13} style={{ opacity: 0.55, flexShrink: 0 }} /> : null}
                  <span style={{ whiteSpace: "pre-wrap" }}>
                    {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                  </span>
                </div>
              ))}

              {isPending ? (
                <div className="qship-rotator-bubble qship-agent-msg" style={{ fontSize: 13 }}>
                  <Loader2 size={13} className="qship-spin" />
                  <span style={{ color: "var(--qship-muted)", fontStyle: "italic" }}>
                    {streamStatus ?? "Thinking…"}
                  </span>
                  <button
                    type="button"
                    className="qship-btn-ghost"
                    style={{ fontSize: 11, padding: "4px 10px", marginLeft: "auto" }}
                    onClick={stopStream}
                  >
                    Stop
                  </button>
                </div>
              ) : null}

              {!isPending && (messages.length === 0 || urlWalkthrough) ? (
                <div className="qship-agent-suggest">
                  {(urlWalkthrough ? WALKTHROUGH_SUGGESTIONS : SUGGESTIONS).map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => send(s.prompt)}
                      disabled={isPending || createSession.isPending}
                      title={!ready ? "Set OPENAI_API_KEY in .env to run the agent" : undefined}
                    >
                      <s.icon size={13} />
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="qship-agent-composer-wrap">
                <div className="qship-agent-focus-row">
                  <AgentFocusChip focus={focus} onClear={() => void handleClearFocus()} disabled={isPending} />
                  <button
                    type="button"
                    className="qship-agent-attach-btn"
                    onClick={() => setPickerOpen((v) => !v)}
                    disabled={isPending}
                  >
                    <Paperclip size={12} />
                    Attach
                  </button>
                </div>
                <AgentContextPicker
                  open={pickerOpen}
                  onClose={() => setPickerOpen(false)}
                  onSelect={(next) => void handleAttachFocus(next)}
                  disabled={isPending}
                />
                {isFeatureFocusId(focus.contextId) ? (
                  <div className="qship-agent-delivery-wrap">
                    <FeatureDeliveryPanel
                      featureId={fromFeatureFocusId(focus.contextId!)}
                      compact
                      showOpenLink
                    />
                  </div>
                ) : null}
                <AgentMentionInput
                  value={input}
                  onChange={setInput}
                  onSubmit={() => send(input)}
                  disabled={isPending}
                  placeholder={agentPlaceholder}
                />
              </div>
            </form>
          </div>

          <div className="qship-agent-side">
            {walkthroughFeatureId ? (
              <TaskWalkthroughPanel
                state={walkthroughStateQuery.data}
                explain={walkthroughExplain}
                loading={walkthroughStateQuery.isLoading}
                explaining={explainTaskMutation.isPending}
                depth={walkthroughDepth}
                onSelectTask={(taskId) => {
                  setActiveWalkthroughTaskId(taskId);
                  void refreshWalkthroughExplain(taskId, "brief", urlAnalyzeRepo);
                }}
              />
            ) : null}

            <ActionPanel
              actions={lastActions}
              agentAutoApprove={agentAutoApprove}
              onQueueResolved={() => setLastActions([])}
              userEmail={meQuery.data?.email}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentPageFallback() {
  return (
    <div className="qship-app-page">
      <div className="qship-agent-layout" style={{ padding: 24 }}>
        <SkeletonList count={4} />
      </div>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<AgentPageFallback />}>
      <AgentPageContent />
    </Suspense>
  );
}
