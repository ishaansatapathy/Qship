-- Engineering task metadata (type + per-task acceptance criteria)
ALTER TABLE "engineering_tasks"
  ADD COLUMN IF NOT EXISTS "task_type" text,
  ADD COLUMN IF NOT EXISTS "acceptance_criteria" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Agent session walkthrough state (survives page refresh)
ALTER TABLE "agent_chat_sessions"
  ADD COLUMN IF NOT EXISTS "walkthrough_task_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "analyze_repo" boolean NOT NULL DEFAULT false;
