export type RfqStatus =
  | 'draft'
  | 'needs_clarification'
  | 'awaiting_sales_confirmation'
  | 'awaiting_technical_review'
  | 'approved_for_export';

export type RequirementOrigin = 'explicit' | 'inferred' | 'manual';

export interface RequirementField {
  value: string | number | string[] | null;
  unit?: string | null;
  evidence?: string;
  origin?: RequirementOrigin;
}

export interface RfqCaseSummary {
  id: string;
  status: RfqStatus;
  customer_name?: string | null;
  project_name?: string | null;
  active_revision: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RfqCandidate {
  sku: string;
  model_name: string;
  fit_score: number;
  flow_min_m3h: number;
  flow_max_m3h: number;
  head_min_m: number;
  head_max_m: number;
  temp_min_c: number;
  temp_max_c: number;
  wetted_material: string;
  motor_power_kw: number;
  voltage_v: number;
  frequency_hz: number;
  ip_rating: string;
  seal_type: string;
  reference_price_cny: number;
  lead_time_days: number;
  price_note?: string;
  risks?: string[];
}

export interface RfqConflict {
  sku: string;
  reasons: string[];
}

export interface RfqEvidence {
  doc_name?: string;
  title?: string;
  content?: string;
  text?: string;
  [key: string]: unknown;
}

export interface RfqRecommendation {
  catalog_version_id: number;
  revision_no: number;
  candidates: RfqCandidate[];
  conflicts: RfqConflict[];
  evidence: RfqEvidence[];
}

export interface RfqAttachment {
  id: number;
  filename: string;
  content_type?: string | null;
  size_bytes: number;
  created_at: string;
}

export interface RfqApproval {
  approval_type: string;
  decision: string;
  actor: string;
  comment?: string;
  created_at: string;
}

export interface RfqAuditEvent {
  event_type: string;
  actor: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface RfqCase extends RfqCaseSummary {
  source_text: string;
  revision: {
    revision_no: number;
    requirements: Record<string, RequirementField>;
    missing: string[];
    response_text: string;
    created_by?: string;
    created_at: string;
  };
  recommendation: RfqRecommendation | null;
  approvals: RfqApproval[];
  attachments: RfqAttachment[];
  audit: RfqAuditEvent[];
}

export interface RfqFieldDefinition {
  key: string;
  label: string;
  unit: string;
  required: boolean;
  type: 'text' | 'number' | 'medium';
}
