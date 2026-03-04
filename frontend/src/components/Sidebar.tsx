import { NavLink } from 'react-router-dom';
import {
  FireIcon,
  TruckIcon,
  BeakerIcon,
  SparklesIcon,
  ScaleIcon,
  ExclamationTriangleIcon,
  CubeIcon,
  BuildingStorefrontIcon,
  WrenchScrewdriverIcon,
  MapPinIcon,
  XMarkIcon,
  HomeIcon,
  UserGroupIcon,
  ArchiveBoxIcon,
  DocumentTextIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import Bi from '@/components/Bi';

interface NavItem {
  to: string;
  label: string;
  labelKey?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

interface NavSection {
  title: string;
  titleKey?: string;
  items: NavItem[];
  roles?: string[];
}

const navSections: NavSection[] = [
  {
    title: '記錄',
    titleKey: 'nav.records',
    items: [
      { to: '/cooking-logs', label: '烹飪記錄', labelKey: 'nav.cooking', icon: FireIcon },
      { to: '/receiving-logs', label: '收貨記錄', labelKey: 'nav.receiving', icon: TruckIcon },
      { to: '/cooling-logs', label: '冷卻記錄', labelKey: 'nav.cooling', icon: BeakerIcon },
      { to: '/sanitising-logs', label: '清潔消毒', labelKey: 'nav.sanitising', icon: SparklesIcon },
      { to: '/assembly-logs', label: '組裝包裝', labelKey: 'nav.assembly', icon: ScaleIcon },
      { to: '/deviations', label: '偏差記錄', labelKey: 'nav.deviations', icon: ExclamationTriangleIcon },
    ],
  },
  {
    title: '參考資料',
    titleKey: 'nav.reference',
    items: [
      { to: '/reference/products', label: '產品管理', labelKey: 'nav.products', icon: CubeIcon },
      { to: '/reference/suppliers', label: '供應商管理', labelKey: 'nav.suppliers', icon: BuildingStorefrontIcon },
      { to: '/reference/equipment', label: '設備管理', labelKey: 'nav.equipment', icon: WrenchScrewdriverIcon },
      { to: '/reference/areas', label: '區域管理', labelKey: 'nav.areas', icon: MapPinIcon },
    ],
  },
  {
    title: '出入庫管理',
    titleKey: 'nav.inventory',
    items: [
      { to: '/inventory/balance', label: '庫存查詢', labelKey: 'nav.invBalance', icon: ChartBarIcon },
      { to: '/inventory/docs', label: '入出庫單', labelKey: 'nav.invDocs', icon: DocumentTextIcon },
      { to: '/inventory/items', label: '品項管理', labelKey: 'nav.invItems', icon: ArchiveBoxIcon },
      { to: '/inventory/locations', label: '儲位管理', labelKey: 'nav.invLocations', icon: MapPinIcon },
    ],
  },
  {
    title: '系統管理',
    titleKey: 'nav.system',
    items: [
      { to: '/users', label: '帳號管理', labelKey: 'nav.users', icon: UserGroupIcon },
    ],
    roles: ['Manager'],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth();

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const visibleSections = navSections.filter(
    (section) => !section.roles || section.roles.includes(user?.role || '')
  );

  const sidebarContent = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <NavLink to="/" className={linkClasses} onClick={onClose} end>
        <HomeIcon className="h-5 w-5" />
        <Bi k="nav.home" />
      </NavLink>

      {visibleSections.map((section) => (
        <div key={section.title} className="mt-6">
          <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {section.titleKey ? <Bi k={section.titleKey} /> : section.title}
          </h3>
          <div className="mt-2 space-y-1">
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClasses} onClick={onClose}>
                <item.icon className="h-5 w-5" />
                {item.labelKey ? <Bi k={item.labelKey} /> : item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-lg font-bold text-primary-600">HACCP eQMS</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100"
          >
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:border-r lg:border-gray-200 lg:bg-white lg:pt-16">
        {sidebarContent}
      </aside>
    </>
  );
}
