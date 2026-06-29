import type { ShipflowToolContext } from "../definitions";
import * as workspace_features from "./workspace-features";
import * as delivery_workflows from "./delivery-workflows";
import * as review_release from "./review-release";
import * as github_analytics from "./github-analytics";
import * as walkthrough from "./walkthrough";

type ToolHandler = (ctx: ShipflowToolContext, args: Record<string, unknown>) => Promise<string>;

export const SHIPFLOW_TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_workspace: workspace_features.handle_get_workspace,
  list_feature_requests: workspace_features.handle_list_feature_requests,
  get_feature_request: workspace_features.handle_get_feature_request,
  create_feature_request: workspace_features.handle_create_feature_request,
  triage_feature_request: workspace_features.handle_triage_feature_request,
  add_clarification: workspace_features.handle_add_clarification,
  update_feature_status: workspace_features.handle_update_feature_status,
  get_pipeline_summary: workspace_features.handle_get_pipeline_summary,
  check_existing_capability: workspace_features.handle_check_existing_capability,
  intake_from_channel: workspace_features.handle_intake_from_channel,
  get_feature_delivery: workspace_features.handle_get_feature_delivery,
  update_engineering_task_status: workspace_features.handle_update_engineering_task_status,
  generate_feature_prd: delivery_workflows.handle_generate_feature_prd,
  generate_feature_tasks: delivery_workflows.handle_generate_feature_tasks,
  implement_feature_code: delivery_workflows.handle_implement_feature_code,
  run_ai_review: review_release.handle_run_ai_review,
  request_human_review: review_release.handle_request_human_review,
  list_ai_reviews: review_release.handle_list_ai_reviews,
  get_review_delta: review_release.handle_get_review_delta,
  get_review_stats: review_release.handle_get_review_stats,
  approve_feature: review_release.handle_approve_feature,
  ship_feature: review_release.handle_ship_feature,
  reject_feature: review_release.handle_reject_feature,
  request_changes: review_release.handle_request_changes,
  get_approval_history: review_release.handle_get_approval_history,
  get_approval_briefing: review_release.handle_get_approval_briefing,
  resolve_review_issue: review_release.handle_resolve_review_issue,
  analyze_change_request: review_release.handle_analyze_change_request,
  get_review_loop_health: review_release.handle_get_review_loop_health,
  github_connection_status: github_analytics.handle_github_connection_status,
  list_github_repositories: github_analytics.handle_list_github_repositories,
  predict_delivery_timeline: github_analytics.handle_predict_delivery_timeline,
  check_pipeline_duplicates: github_analytics.handle_check_pipeline_duplicates,
  get_pipeline_health: github_analytics.handle_get_pipeline_health,
  get_developer_onboarding_guide: github_analytics.handle_get_developer_onboarding_guide,
  explain_engineering_task: walkthrough.handle_explain_engineering_task,
  advance_task_walkthrough: walkthrough.handle_advance_task_walkthrough,
};
