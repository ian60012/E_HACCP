import client from './client';
import { MeatRecord, MeatSave } from '@/types/meatProcessing';
const url = (id: number) => `/api/v1/production/batches/${id}/meat`;
export const meatApi = {
  get: async (id: number): Promise<MeatRecord | null> => (await client.get(url(id))).data,
  history: async (id: number): Promise<MeatRecord[]> => (await client.get(`${url(id)}/history`)).data,
  save: async (id: number, data: MeatSave): Promise<MeatRecord> => (await client.put(url(id), {
    ...data,
    inputs: data.inputs.map(({ item_name, ...row }) => row),
    outputs: data.outputs.map(({ item_name, location_name, ...row }) => row),
  })).data,
  complete: async (id: number, version: number, signature: string): Promise<MeatRecord> =>
    (await client.post(`${url(id)}/complete`, { version, operator_signature_data_url: signature })).data,
  verify: async (id: number, version: number, signature: string): Promise<MeatRecord> =>
    (await client.post(`${url(id)}/verify`, { version, verifier_signature_data_url: signature })).data,
  enterStock: async (id: number, version: number): Promise<MeatRecord> =>
    (await client.post(`${url(id)}/enter-stock`, { version })).data,
};
export function meatError(error: any): string {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : Array.isArray(detail)
    ? detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
    : '操作失敗，請重試 Operation failed; please retry';
}
