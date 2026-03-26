import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  FireIcon,
  TruckIcon,
  BeakerIcon,
  SparklesIcon,
  ScaleIcon,
  ShieldCheckIcon,
  AdjustmentsHorizontalIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import Bi from '@/components/Bi';

const logCards = [
  {
    titleKey: 'nav.mixing',
    descKey: 'dashboard.mixing.desc',
    icon: AdjustmentsHorizontalIcon,
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    listTo: '/mixing-logs',
    newTo: '/mixing-logs/new',
  },
  {
    titleKey: 'nav.cooking',
    descKey: 'dashboard.cooking.desc',
    icon: FireIcon,
    color: 'bg-red-50 text-red-600 border-red-200',
    listTo: '/cooking-logs',
    newTo: '/cooking-logs/new',
  },
  {
    titleKey: 'nav.receiving',
    descKey: 'dashboard.receiving.desc',
    icon: TruckIcon,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    listTo: '/receiving-logs',
    newTo: '/receiving-logs/new',
  },
  {
    titleKey: 'nav.cooling',
    descKey: 'dashboard.cooling.desc',
    icon: BeakerIcon,
    color: 'bg-cyan-50 text-cyan-600 border-cyan-200',
    listTo: '/cooling-logs',
    newTo: '/cooling-logs/new',
  },
  {
    titleKey: 'nav.sanitising',
    descKey: 'dashboard.sanitising.desc',
    icon: SparklesIcon,
    color: 'bg-green-50 text-green-600 border-green-200',
    listTo: '/sanitising-logs',
    newTo: '/sanitising-logs/new',
  },
  {
    titleKey: 'nav.assembly',
    descKey: 'dashboard.assembly.desc',
    icon: ScaleIcon,
    color: 'bg-purple-50 text-purple-600 border-purple-200',
    listTo: '/assembly-logs',
    newTo: '/assembly-logs/new',
  },
  {
    titleKey: 'nav.ppe',
    descKey: 'dashboard.ppe.desc',
    icon: ShieldCheckIcon,
    color: 'bg-teal-50 text-teal-600 border-teal-200',
    listTo: '/ppe-compliance-logs',
    newTo: '/ppe-compliance-logs/new',
  },
  {
    titleKey: 'nav.deviations',
    descKey: 'dashboard.deviation.desc',
    icon: ExclamationTriangleIcon,
    color: 'bg-orange-50 text-orange-600 border-orange-200',
    listTo: '/deviations',
    newTo: '/deviations/new',
  },
];

const roleLabelKeys: Record<string, string> = {
  Admin: 'role.admin',
  QA: 'role.qa',
  Production: 'role.production',
  Warehouse: 'role.warehouse',
};

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          <Bi k="page.dashboard.welcome" />，{user?.full_name}
        </h1>
        <p className="text-gray-500 mt-1">
          {roleLabelKeys[user?.role || ''] ? <Bi k={roleLabelKeys[user?.role || '']} /> : user?.role} · <Bi k="page.dashboard.subtitle" />
        </p>
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {logCards.map((card) => (
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
              <Link
                to={card.newTo}
                className="flex items-center justify-center py-2 px-3 bg-white/80 hover:bg-white rounded-lg text-sm font-medium transition-colors"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                <Bi k="btn.create" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links for reference data */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-3"><Bi k="dashboard.refData" /></h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link to="/production/products" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center text-sm font-medium text-gray-700 transition-colors">
            <Bi k="nav.products" />
          </Link>
          <Link to="/reference/suppliers" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center text-sm font-medium text-gray-700 transition-colors">
            <Bi k="nav.suppliers" />
          </Link>
          <Link to="/reference/equipment" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center text-sm font-medium text-gray-700 transition-colors">
            <Bi k="nav.equipment" />
          </Link>
          <Link to="/reference/areas" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center text-sm font-medium text-gray-700 transition-colors">
            <Bi k="nav.areas" />
          </Link>
        </div>
      </div>
    </div>
  );
}
