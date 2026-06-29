ALTER TABLE "agent_chat_sessions" ADD COLUMN IF NOT EXISTS "pending_confirmation" jsonb;
