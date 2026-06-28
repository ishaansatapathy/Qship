import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

/** Persists the flat conversation buffer for a user's agent session. */
export const agentChatHistoryTable = pgTable(
  "agent_chat_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messages: jsonb("messages")
      .$type<Array<{ role: "user" | "assistant"; content: string }>>()
      .notNull()
      .default([]),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_chat_history_user_id_idx").on(t.userId),
  ],
);

export type SelectAgentChatHistory = typeof agentChatHistoryTable.$inferSelect;
export type InsertAgentChatHistory = typeof agentChatHistoryTable.$inferInsert;
