import { ALCOAFields } from './common';

export type LogType = 'receiving' | 'cooking' | 'cooling' | 'sanitising' | 'assembly';
export type Severity = 'Critical' | 'Major' | 'Minor';
export type ImmediateAction = 'Quarantine' | 'Hold' | 'Discard' | 'Rework' | 'Other';

export interface DeviationLog extends ALCOAFields {
  id: number;
  source_log_type: LogType;
  source_log_id: number;
  description: string;
  severity: Severity;
  immediate_action: ImmediateAction;
  immediate_action_detail: string | null;
  root_cause: string | null;
  preventive_action: string | null;
  closed_by: number | null;
  closed_at: string | null;
  closure_notes: string | null;
  notes: string | null;
}

export interface DeviationLogCreate {
  source_log_type: LogType;
  source_log_id: number;
  description: string;
  severity?: Severity;
  immediate_action: ImmediateAction;
  immediate_action_detail?: string;
  root_cause?: string;
  preventive_action?: string;
  notes?: string;
}

export interface DeviationLogUpdate {
  root_cause?: string;
  preventive_action?: string;
  notes?: string;
}

export interface DeviationCloseRequest {
  root_cause: string;
  preventive_action: string;
  closure_notes?: string;
}
