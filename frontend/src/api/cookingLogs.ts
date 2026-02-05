import apiClient from './client'

export interface CookingLogCreate {
  batch_no: string
  product_id: number
  operator_id: number
  start_time: string
  end_time: string
  core_temp: number
}

export interface CookingLogResponse {
  id: number
  batch_no: string
  product_id: number
  product_name?: string
  operator_id: number
  operator_username?: string
  start_time: string
  end_time: string
  core_temp: number
  status: 'PASS' | 'FAIL'
  created_at: string
}

export const cookingLogsApi = {
  async getAll(skip = 0, limit = 100) {
    const response = await apiClient.get<CookingLogResponse[]>('/api/v1/cooking-logs', {
      params: { skip, limit },
    })
    return response.data
  },

  async getById(id: number) {
    const response = await apiClient.get<CookingLogResponse>(`/api/v1/cooking-logs/${id}`)
    return response.data
  },

  async create(data: CookingLogCreate) {
    const response = await apiClient.post<CookingLogResponse>('/api/v1/cooking-logs', data)
    return response.data
  },
}
