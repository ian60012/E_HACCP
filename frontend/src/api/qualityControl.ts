import apiClient from './client';
import { QualityInspection, QualityInspectionContext, QualityInspectionSave, QualityPermissionsConfig, QualityRolePermission } from '@/types/qualityControl';

export const qualityControlApi = {
  get: async (batchId: number): Promise<QualityInspectionContext> => (await apiClient.get(`/api/v1/production/batches/${batchId}/quality-inspection`)).data,
  save: async (batchId: number, data: QualityInspectionSave): Promise<QualityInspection> => (await apiClient.post(`/api/v1/production/batches/${batchId}/quality-inspection`, data)).data,
  revise: async (batchId: number): Promise<QualityInspection> => (await apiClient.post(`/api/v1/production/batches/${batchId}/quality-inspection/revise`)).data,
  verify: async (batchId: number, signature: string): Promise<QualityInspection> => (await apiClient.post(`/api/v1/production/batches/${batchId}/quality-inspection/verify`, { verifier_signature_data_url: signature })).data,
  uploadPhoto: async (batchId: number, photo: File): Promise<QualityInspection> => {
    const data = new FormData(); data.append('photo', photo);
    return (await apiClient.post(`/api/v1/production/batches/${batchId}/quality-inspection/photo`, data, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 })).data;
  },
  getPhoto: async (batchId: number): Promise<Blob> => (await apiClient.get(`/api/v1/production/batches/${batchId}/quality-inspection/photo`, { responseType: 'blob' })).data,
  getPermissions: async (): Promise<QualityPermissionsConfig> => (await apiClient.get('/api/v1/quality-control/permissions')).data,
  updatePermissions: async (roles: QualityRolePermission[]): Promise<QualityPermissionsConfig> => {
    const editable = roles.filter((row) => ['QA', 'Production', 'Warehouse'].includes(row.role))
      .map(({ role, can_view, can_edit, can_verify }) => ({ role, can_view, can_edit, can_verify }));
    return (await apiClient.put('/api/v1/quality-control/permissions', { roles: editable })).data;
  },
};

export function qualityError(error: any): string {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ');
  return typeof detail === 'string' ? detail : '操作失败，请重试 Operation failed';
}

export async function prepareQualityPhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPEG、PNG 或 WebP 图片');
  const bitmap = await createImageBitmap(file); const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d'); if (!context) throw new Error('无法处理图片');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('无法压缩图片');
  if (blob.size > 5 * 1024 * 1024) throw new Error('压缩后的图片仍超过 5 MB');
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'quality-photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
