export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SupplierCreate {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface SupplierUpdate {
  name?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
}
