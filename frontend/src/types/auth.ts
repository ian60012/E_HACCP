export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role: 'Admin' | 'QA' | 'Production' | 'Warehouse';
  is_active: boolean;
  created_at: string;
}

export interface UserCreate {
  username: string;
  password: string;
  full_name: string;
  email?: string;
  role?: 'Admin' | 'QA' | 'Production' | 'Warehouse';
}

export interface UserUpdate {
  full_name?: string;
  email?: string;
  role?: 'Admin' | 'QA' | 'Production' | 'Warehouse';
  is_active?: boolean;
}
