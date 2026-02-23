export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface ALCOAFields {
  operator_id: number;
  operator_name: string | null;
  verified_by: number | null;
  verifier_name: string | null;
  is_locked: boolean;
  is_voided: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: number | null;
  created_at: string;
}

export interface VoidRequest {
  void_reason: string;
}

export interface CCPValidationResult {
  status: 'Pass' | 'Fail' | 'Deviation';
  message: string;
  requires_deviation: boolean;
  deviation_description?: string;
}
