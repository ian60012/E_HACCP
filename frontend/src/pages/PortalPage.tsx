import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon, CogIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import Bi, { bi } from '@/components/Bi';

interface SystemCard {
  titleKey: string;
  descKey: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  to: string;
  color: string;
  disabled?: boolean;
}

const systems: SystemCard[] = [
  {
    titleKey: 'page.portal.haccp',
    descKey: 'page.portal.haccpDesc',
    icon: ShieldCheckIcon,
    to: '/haccp',
    color: 'text-primary-600 bg-primary-50 border-primary-200 hover:border-primary-400',
  },
  {
    titleKey: 'page.portal.production',
    descKey: 'page.portal.productionDesc',
    icon: CogIcon,
    to: '/production',
    color: 'text-amber-600 bg-amber-50 border-amber-200 hover:border-amber-400',
  },
  {
    titleKey: 'page.portal.inventory',
    descKey: 'page.portal.inventoryDesc',
    icon: ArchiveBoxIcon,
    to: '/inventory/balance',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:border-emerald-400',
  },
];

export default function PortalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800">
          <Bi k="page.dashboard.welcome" />，{user?.full_name}
        </h1>
        <p className="text-gray-500 mt-2 text-lg">
          <Bi k="page.portal.subtitle" />
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl">
        {systems.map((sys) => (
          <button
            key={sys.to}
            onClick={() => !sys.disabled && navigate(sys.to)}
            disabled={sys.disabled}
            className={`relative flex flex-col items-center gap-4 rounded-2xl border-2 p-8 text-center transition-all duration-150 ${sys.color} ${
              sys.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:shadow-md'
            }`}
          >
            {sys.disabled && (
              <span className="absolute top-3 right-3 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                <Bi k="page.portal.comingSoon" />
              </span>
            )}
            <sys.icon className="h-12 w-12" />
            <div>
              <p className="text-lg font-bold">
                <Bi k={sys.titleKey} />
              </p>
              <p className="text-xs mt-1 opacity-70">
                {bi(sys.descKey)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
