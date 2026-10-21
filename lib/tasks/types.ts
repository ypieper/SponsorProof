import type { StoredEvidence } from "../evidence-storage";

export type CompletionType = "file_required" | "organizer_approval" | "sponsor_approval" | "sponsor_upload";

export type StoredTaskRecord = { id: string; organization_id: string; event_id: string | null; sponsor_id: string | null; sponsor_name: string; benefit_id: string | null; assigned_to: string | null; assigned_to_sponsor: boolean; template_task_id: string | null; workflow_order: number | null; workflow_instance: number; completion_type: CompletionType; requires_sponsor_approval: boolean; sponsor_approval_status: string; sponsor_approved_at: string | null; publish_ready: boolean; title: string; description: string; due_at: string | null; status: string; source: string; created_at: string };

export type TaskInput = { title: string; eventId?: string; sponsorId?: string; sponsorName?: string; dueAt?: string; source?: "Manuell" | "Leistung"; benefitId?: string; assignedTo?: string; assignedToSponsor?: boolean; templateTaskId?: string; workflowOrder?: number; workflowInstance?: number; completionType?: CompletionType };

export type SponsorTaskFeedback = { id: string; decision: string; comment: string; created_at: string };

export type OrganizerTaskFeedback = { id: string; decision: string; comment: string; created_at: string };

export type OrganizerMember = { user_id: string; email: string; role: string; full_name?: string };

export type Task = { id: string; title: string; sponsor: string; sponsorId: string; due: string; dueAt?: string; status: "Offen" | "Erledigt"; eventId: string; eventTitle: string; source: "Leistung" | "Manuell"; storedTask?: boolean; benefitId?: string; benefitTitle?: string; benefitQuantity?: number; benefitTasksPerUnit?: boolean; benefitType?: "monetary" | "in_kind"; workflowOrder?: number; workflowInstance?: number; completionType?: CompletionType; blockedBy?: string; currentWorkflowStep?: boolean; assignee?: string; assigneeId?: string; assignedToSponsor?: boolean; publishReady?: boolean; sponsorApprovalStatus?: string; requiresSponsorApproval?: boolean; sponsorFeedback?: SponsorTaskFeedback[]; organizerFeedback?: OrganizerTaskFeedback[] };

export type Evidence = StoredEvidence;
