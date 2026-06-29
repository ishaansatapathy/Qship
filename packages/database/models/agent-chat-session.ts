import { jsonb, pgTable, text, timestamp, uuid, varchar, boolean } from "drizzle-orm/pg-core";

import { users } from "./auth";

export type AgentSessionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentSessionToolMemoryEntry = {
  at: string;
  tool: string;
  summary: string;
  contextId?: string;
  eventId?: string;
  query?: string;
};

export type AgentPendingConfirmation = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  label: string;
  proposedAt: string;
};

export const agentChatSessionsTable = pgTable("agent_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }),
  messages: jsonb("messages").$type<AgentSessionMessage[]>().notNull().default([]),
  toolMemory: jsonb("tool_memory").$type<AgentSessionToolMemoryEntry[]>().notNull().default([]),
  pendingConfirmation: jsonb("pending_confirmation").$type<AgentPendingConfirmation | null>(),
  focusContextId: varchar("focus_context_id", { length: 128 }),
  focusEventId: varchar("focus_event_id", { length: 256 }),
  focusContextLabel: varchar("focus_context_label", { length: 200 }),
  focusEventLabel: varchar("focus_event_label", { length: 200 }),
  walkthroughTaskId: varchar("walkthrough_task_id", { length: 36 }),
  analyzeRepo: boolean("analyze_repo").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SelectAgentChatSession = typeof agentChatSessionsTable.$inferSelect;
export type InsertAgentChatSession = typeof agentChatSessionsTable.$inferInsert;
