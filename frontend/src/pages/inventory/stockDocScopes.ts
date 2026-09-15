import { InvDocType, ItemType } from '@/types/inventory';
import { t } from '@/i18n/labels';

export const STOCK_DOC_SCOPES: Record<InvDocType, ItemType[]> = {
  IN: ['raw', 'packaging', 'intermediate', 'finished'],
  OUT: ['intermediate', 'finished'],
};

export function stockDocLabel(direction: InvDocType, scope?: ItemType | null) {
  const category = t(scope ? `inv.itemType.${scope}` : 'label.general');
  const action = t(direction === 'IN' ? 'label.stockIn' : 'label.stockOut');
  return { zh: `${category.zh}${action.zh}`, en: `${category.en} ${action.en}` };
}

export function stockDocNewUrl(direction: InvDocType, scope?: ItemType) {
  const params = new URLSearchParams({ type: direction });
  if (scope) params.set('item_type', scope);
  return `/inventory/docs/new?${params}`;
}
