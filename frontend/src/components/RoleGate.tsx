import { useAuth } from '@/hooks/useAuth';

interface RoleGateProps {
  roles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Only renders children if the current user has one of the specified roles.
 * Usage: <RoleGate roles={['QA', 'Admin']}><LockButton /></RoleGate>
 */
export default function RoleGate({ roles, children, fallback = null }: RoleGateProps) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
