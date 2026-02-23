export interface Product {
  id: number;
  name: string;
  ccp_limit_temp: string; // Decimal as string
  is_active: boolean;
  created_at: string;
}

export interface ProductCreate {
  name: string;
  ccp_limit_temp?: string;
}

export interface ProductUpdate {
  name?: string;
  ccp_limit_temp?: string;
  is_active?: boolean;
}
