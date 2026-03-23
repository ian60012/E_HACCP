import { Link } from 'react-router-dom';
import {
  ClipboardDocumentListIcon,
  FireIcon,
  ArrowPathIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import Bi from '@/components/Bi';
import RoleGate from '@/components/RoleGate';

const prodCards = [
  {
    titleKey: 'nav.formingBatches',
    descKey: 'page.prodDashboard.formingDesc',
    icon: ClipboardDocumentListIcon,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    listTo: '/production/batches?type=forming',
    newTo: '/production/batches/new?type=forming',
  },
  {
    titleKey: 'nav.hotProcessBatches',
    descKey: 'page.prodDashboard.hotProcessDesc',
    icon: FireIcon,
    color: 'bg-red-50 text-red-600 border-red-200',
    listTo: '/production/batches?type=hot_process',
    newTo: '/production/batches/new?type=hot_process',
  },
  {
    titleKey: 'nav.prodRepack',
    descKey: 'page.prodDashboard.repackDesc',
    icon: ArrowPathIcon,
    color: 'bg-orange-50 text-orange-600 border-orange-200',
    listTo: '/production/repack',
    newTo: '/production/repack/new',
  },
  {
    titleKey: 'nav.prodProducts',
    descKey: 'page.prodDashboard.productsDesc',
    icon: ArchiveBoxIcon,
    color: 'bg-green-50 text-green-600 border-green-200',
    listTo: '/production/products',
    newTo: '/production/products',
  },
];

export default function ProductionDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          <Bi k="page.prodDashboard.title" />
        </h1>
        <p className="text-gray-500 mt-1">
          <Bi k="page.prodDashboard.subtitle" />
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {prodCards.map((card) => (
          <div
            key={card.titleKey}
            className={`rounded-xl border p-5 transition-shadow hover:shadow-md ${card.color}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <card.icon className="h-8 w-8" />
                <div>
                  <h3 className="font-semibold"><Bi k={card.titleKey} /></h3>
                  <p className="text-sm opacity-75 mt-0.5"><Bi k={card.descKey} /></p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Link
                to={card.listTo}
                className="flex-1 text-center py-2 px-3 bg-white/60 hover:bg-white/80 rounded-lg text-sm font-medium transition-colors"
              >
                <Bi k="btn.viewRecords" />
              </Link>
              <RoleGate roles={['Admin', 'Production']}>
                <Link
                  to={card.newTo}
                  className="flex items-center justify-center py-2 px-3 bg-white/80 hover:bg-white rounded-lg text-sm font-medium transition-colors"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  <Bi k="btn.create" />
                </Link>
              </RoleGate>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
