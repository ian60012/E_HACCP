import { InvItem } from '@/types/inventory';

export function isMeatOutputItem(item: InvItem): boolean {
  return item.is_active
    && (['intermediate', 'finished'].includes(item.item_type) || !!item.meat_output_type)
    && ['kg', '公斤'].includes(item.base_unit.trim().toLowerCase());
}
