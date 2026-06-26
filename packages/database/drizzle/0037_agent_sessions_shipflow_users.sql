-- Point agent session tables at BetterAuth shipflow_users (text ids).
ALTER TABLE "agent_chat_sessions" DROP CONSTRAINT IF EXISTS "agent_chat_sessions_user_id_fkey";
ALTER TABLE "agent_chat_sessions" DROP CONSTRAINT IF EXISTS "agent_chat_sessions_user_id_users_id_fk";

DELETE FROM "agent_chat_sessions";

ALTER TABLE "agent_chat_sessions"
  ALTER COLUMN "user_id" TYPE text USING "user_id"::text;

ALTER TABLE "agent_chat_sessions"
  ADD CONSTRAINT "agent_chat_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "shipflow_users"("id") ON DELETE CASCADE;

ALTER TABLE "agent_chat_history" DROP CONSTRAINT IF EXISTS "agent_chat_history_user_id_fkey";
ALTER TABLE "agent_chat_history" DROP CONSTRAINT IF EXISTS "agent_chat_history_user_id_users_id_fk";

DELETE FROM "agent_chat_history";

ALTER TABLE "agent_chat_history"
  ALTER COLUMN "user_id" TYPE text USING "user_id"::text;

ALTER TABLE "agent_chat_history"
  ADD CONSTRAINT "agent_chat_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "shipflow_users"("id") ON DELETE CASCADE;
