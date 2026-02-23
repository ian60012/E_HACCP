export interface Equipment {
  id: number;
  name: string;
  equipment_type: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface EquipmentCreate {
  name: string;
  equipment_type?: string;
  location?: string;
}

export interface EquipmentUpdate {
  name?: string;
  equipment_type?: string;
  location?: string;
  is_active?: boolean;
}
