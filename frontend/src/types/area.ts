export interface Area {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AreaCreate {
  name: string;
  description?: string;
}

export interface AreaUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}
