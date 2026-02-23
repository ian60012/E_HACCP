import { Bars3Icon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import Bi from '@/components/Bi';

const roleBadgeColors: Record<string, string> = {
  Operator: 'bg-blue-100 text-blue-700',
  QA: 'bg-green-100 text-green-700',
  Manager: 'bg-purple-100 text-purple-700',
};

const roleLabelKeys: Record<string, string> = {
  Operator: 'role.operator',
  QA: 'role.qa',
  Manager: 'role.manager',
};

interface NavBarProps {
  onMenuClick: () => void;
}

export default function NavBar({ onMenuClick }: NavBarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 h-16">
      <div className="flex items-center justify-between h-full px-4">
        {/* Left: menu button + logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
          >
            <Bars3Icon className="h-6 w-6 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-primary-600">
            <span className="hidden sm:inline">FD Catering </span>HACCP eQMS
          </h1>
        </div>

        {/* Right: user info + logout */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm text-gray-700">{user.full_name}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColors[user.role] || 'bg-gray-100 text-gray-700'}`}>
                {roleLabelKeys[user.role] ? <Bi k={roleLabelKeys[user.role]} /> : user.role}
              </span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="登出 Logout"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span className="hidden sm:inline"><Bi k="btn.logout" /></span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
