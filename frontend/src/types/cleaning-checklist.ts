import { ALCOAFields } from './common';

export type CleaningLineType = 'dumpling' | 'cooking';
export type CleaningCheckResult = 'clean' | 'needs_cleaning' | 'damaged_faulty';

export interface CleaningChecklistItem {
  code: string;
  section_code: string;
  section_name_en: string;
  section_name_zh: string;
  item_name_en: string;
  item_name_zh: string;
  result: CleaningCheckResult | null;
  comments: string | null;
}

export interface CleaningChecklist extends ALCOAFields {
  id: number;
  check_date: string;
  line_type: CleaningLineType;
  items: CleaningChecklistItem[];
  notes: string | null;
}

export interface CleaningChecklistTemplate {
  line_type: CleaningLineType;
  form_code: string;
  title_en: string;
  title_zh: string;
  items: CleaningChecklistItem[];
}

export interface CleaningChecklistWrite {
  check_date: string;
  line_type: CleaningLineType;
  items: CleaningChecklistItem[];
  notes?: string | null;
}
