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

  // Captain is a super-role — implicitly allowed for every gated UI element.
  if (!user) {
    return <>{fallback}</>;
  }
  if (user.role !== 'Captain' && !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
