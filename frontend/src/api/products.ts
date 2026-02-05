import apiClient from './client'

export interface Product {
  id: number
  name: string
  ccp_limit_temp: number
  is_active: boolean
}

export const productsApi = {
  async getAll() {
    // Note: This endpoint needs to be created in the backend
    // For now, return empty array
    return [] as Product[]
  },
}
