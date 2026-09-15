import { Link } from 'react-router-dom';
import { InvDocType } from '@/types/inventory';
import Bi from '@/components/Bi';
import { STOCK_DOC_SCOPES, stockDocLabel, stockDocNewUrl } from './stockDocScopes';

export default function StockDocNewMenu() {
  return (
    <details className="relative">
      <summary className="btn btn-primary cursor-pointer list-none"><Bi k="btn.newDoc" /> ▾</summary>
      <div className="absolute right-0 z-20 mt-2 grid grid-cols-2 gap-3 rounded-lg border bg-white p-3 shadow-lg w-80 max-w-[90vw]">
        {(['IN', 'OUT'] as InvDocType[]).map((direction) => (
          <div key={direction} className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-700"><Bi k={direction === 'IN' ? 'label.stockIn' : 'label.stockOut'} /></h3>
            {[undefined, ...STOCK_DOC_SCOPES[direction]].map((scope) => (
              <Link key={scope || 'general'} to={stockDocNewUrl(direction, scope)} className="block rounded px-2 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50">
                <Bi label={stockDocLabel(direction, scope)} />
              </Link>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}
