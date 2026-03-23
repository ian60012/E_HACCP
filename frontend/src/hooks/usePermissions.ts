import { useAuth } from '@/hooks/useAuth';

export type UserRole = 'Admin' | 'QA' | 'Production' | 'Warehouse';

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) ?? null;

  const hasRole = (...roles: UserRole[]) => role !== null && roles.includes(role);

  return {
    role,

    // Route-level: can user access this system/page?
    canAccessHACCP: hasRole('Admin', 'QA', 'Production', 'Warehouse'),
    canAccessProduction: hasRole('Admin', 'QA', 'Production'),
    canAccessInventory: hasRole('Admin', 'QA', 'Warehouse'),
    canAccessUsers: hasRole('Admin'),

    // HACCP log permissions
    canCreateCookingLog: hasRole('Admin', 'QA', 'Production'),
    canCreateReceivingLog: hasRole('Admin', 'QA', 'Warehouse'),
    canCreateCoolingLog: hasRole('Admin', 'QA', 'Production'),
    canCreateAssemblyLog: hasRole('Admin', 'QA', 'Production'),
    canCreateSanitisingLog: hasRole('Admin', 'QA', 'Production'),
    canCreateDeviation: hasRole('Admin', 'QA', 'Production', 'Warehouse'),
    canLockLog: hasRole('Admin', 'QA'),
    canVoidLog: hasRole('Admin'),
    canCloseDeviation: hasRole('Admin', 'QA'),

    // Production permissions
    canCreateBatch: hasRole('Admin', 'Production'),
    canEditBatch: hasRole('Admin', 'Production'),
    canCreateRepack: hasRole('Admin', 'Production'),
    canEditRepack: hasRole('Admin', 'Production'),
    canManageProducts: hasRole('Admin', 'Production'),
    canManagePackTypes: hasRole('Admin', 'Production'),
    canEnterStock: hasRole('Admin', 'Production', 'Warehouse'),

    // Inventory permissions
    canCreateDoc: hasRole('Admin', 'Warehouse'),
    canPostDoc: hasRole('Admin', 'Warehouse'),
    canVoidDoc: hasRole('Admin', 'Warehouse'),
    canManageItems: hasRole('Admin', 'Warehouse'),
    canManageLocations: hasRole('Admin', 'Warehouse'),
    canCreateStocktake: hasRole('Admin', 'Warehouse'),
    canConfirmStocktake: hasRole('Admin', 'Warehouse'),

    // Reference data permissions
    canManageSuppliers: hasRole('Admin', 'QA'),
    canManageEquipment: hasRole('Admin', 'QA'),
    canManageAreas: hasRole('Admin', 'QA'),
    canManageUsers: hasRole('Admin'),
  };
}
