-- Enforce valid human approval decisions at the database layer.
ALTER TABLE "human_approvals"
  ADD CONSTRAINT "human_approvals_decision_check"
  CHECK ("decision" IN ('approved', 'rejected', 'changes_requested'));
