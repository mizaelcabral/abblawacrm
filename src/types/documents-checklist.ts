// ponytail: Single concise source of truth for documents and checklist types

export type DocumentStatus = 'solicitado' | 'recebido' | 'em_analise' | 'aprovado' | 'recusado' | 'vencido';

export interface CRMDocument {
  id: string;
  account_id: string;
  contact_id?: string | null;
  deal_id?: string | null;
  document_type: string;
  display_name: string;
  status: DocumentStatus;
  received_at?: string | null;
  valid_until?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
  version: number;
  current_version_id?: string | null;
  uploaded_by_user_id?: string | null;
  uploaded_by_contact_id?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  retention_until?: string | null;
  is_archived: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  account_id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  file_size: number;
  mime_type: string;
  checksum_sha256?: string | null;
  uploaded_by_user_id?: string | null;
  uploaded_by_contact_id?: string | null;
  created_at: string;
}

export interface DocumentStatusHistory {
  id: string;
  account_id: string;
  document_id: string;
  previous_status?: string | null;
  new_status: string;
  changed_by_user_id?: string | null;
  changed_by_contact_id?: string | null;
  reason?: string | null;
  origin: string;
  created_at: string;
}

export type ChecklistStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'waived';

export interface ChecklistItem {
  id: string;
  account_id: string;
  deal_id: string;
  contact_id?: string | null;
  title: string;
  requirement_type: string;
  is_required: boolean;
  status: ChecklistStatus;
  due_date?: string | null;
  assigned_user_id?: string | null;
  document_id?: string | null;
  document?: Partial<CRMDocument> | null;
  notes?: string | null;
  is_archived: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplate {
  id: string;
  account_id: string;
  pipeline_id?: string | null;
  pipeline_stage_id?: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  account_id: string;
  template_id: string;
  title: string;
  requirement_type: string;
  is_required: boolean;
  due_days_offset?: number | null;
}

export interface ComplianceProfile {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  default_retention_days?: number | null;
  require_reviewer_sign: boolean;
  allowed_mime_types?: string[] | null;
  created_at: string;
}

export interface AccountComplianceSettings {
  account_id: string;
  compliance_profile_id?: string | null;
  custom_retention_days?: number | null;
  retention_legal_basis?: string | null;
  retention_defined_by_user_id?: string | null;
  retention_effective_at?: string | null;
  require_reviewer_sign: boolean;
  updated_at: string;
}

export type ExternalProcessStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'requirement'
  | 'approved'
  | 'denied'
  | 'cancelled'
  | 'expired';

export interface ExternalProcess {
  id: string;
  account_id: string;
  deal_id: string;
  contact_id?: string | null;
  approved_document_id?: string | null;
  process_type: string;
  authority_name: string;
  protocol_number?: string | null;
  status: ExternalProcessStatus;
  submitted_at?: string | null;
  last_status_at: string;
  requirement_due_at?: string | null;
  decision_at?: string | null;
  valid_until?: string | null;
  external_reference?: string | null;
  notes?: string | null;
  status_reason?: string | null;
  assigned_user_id?: string | null;
  created_by_user_id?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalProcessStatusHistory {
  id: string;
  account_id: string;
  process_id: string;
  previous_status?: string | null;
  new_status: string;
  changed_by_user_id?: string | null;
  reason_or_notes?: string | null;
  origin: string;
  created_at: string;
}

