export type QualityResult = 'pass' | 'fail' | 'not_applicable';
export type QualityStatus = 'not_started' | 'draft' | 'approved' | 'rejected';
export type StorageCondition = 'ambient' | 'chilled' | 'frozen' | 'other';

export interface QualityPermissionFlags { can_view: boolean; can_edit: boolean; can_verify: boolean; }

export interface QualityInspection {
  id: number; batch_id: number; revision: number; status: Exclude<QualityStatus, 'not_started'>;
  inspection_at: string | null; color_result: QualityResult | null; aroma_result: QualityResult | null;
  taste_result: QualityResult | null; not_applicable_reason: string | null; notes: string | null;
  corrective_action: string | null; retained_sample: boolean | null; no_sample_reason: string | null;
  sample_code: string | null; sample_quantity: string | null; sample_unit: string | null; sampled_at: string | null;
  storage_condition: StorageCondition | null; storage_location: string | null; disposal_due_date: string | null;
  has_photo: boolean; photo_original_name: string | null; photo_content_type: string | null;
  photo_size_bytes: number | null; photo_uploaded_at: string | null;
  created_by: number; created_by_name: string | null; created_at: string;
  updated_by: number; updated_by_name: string | null; updated_at: string;
  verified_by: number | null; verifier_name: string | null; verified_at: string | null;
  verifier_signature_data_url: string | null;
}

export interface QualityInspectionSave {
  inspection_at?: string | null; color_result?: QualityResult | null; aroma_result?: QualityResult | null;
  taste_result?: QualityResult | null; not_applicable_reason?: string | null; notes?: string | null;
  corrective_action?: string | null; retained_sample?: boolean | null; no_sample_reason?: string | null;
  sample_code?: string | null; sample_quantity?: string | null; sample_unit?: string | null;
  sampled_at?: string | null; storage_condition?: StorageCondition | null; storage_location?: string | null;
  disposal_due_date?: string | null;
}

export interface QualityInspectionContext {
  batch_id: number; batch_code: string; product_name: string; production_date: string;
  process_type: string | null; is_voided: boolean; release_required: boolean;
  permissions: QualityPermissionFlags; inspection: QualityInspection | null;
}

export interface QualityRolePermission extends QualityPermissionFlags {
  role: 'Admin' | 'QA' | 'QC' | 'Production' | 'Warehouse' | 'Captain'; fixed: boolean;
}

export interface QualityPermissionsConfig { enforcement_started_at: string; roles: QualityRolePermission[]; }

export interface QualityBatchSummary {
  batch_id: number; batch_code: string; product_code: string; product_name: string; production_date: string;
  process_type: 'forming' | 'hot_process' | 'meat_processing' | null; production_status: string;
  quality_status: QualityStatus; quality_revision: number | null;
}

export interface QualityBatchDashboardResponse {
  items: QualityBatchSummary[]; total: number; skip: number; limit: number;
  counts: Record<QualityStatus, number>;
}
