import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleGuard from '@/components/RoleGuard';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import PortalPage from '@/pages/PortalPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Production module
import ProductionDashboardPage from '@/pages/production/ProductionDashboardPage';
import ProdBatchListPage from '@/pages/production/ProdBatchListPage';
import ProdBatchFormPage from '@/pages/production/ProdBatchFormPage';
import ProdBatchDetailPage from '@/pages/production/ProdBatchDetailPage';
import ProdPackingPage from '@/pages/production/ProdPackingPage';
import ProdRepackListPage from '@/pages/production/ProdRepackListPage';
import ProdRepackFormPage from '@/pages/production/ProdRepackFormPage';
import ProdRepackDetailPage from '@/pages/production/ProdRepackDetailPage';
import ProdProductsPage from '@/pages/production/ProdProductsPage';
import ProdPackTypesPage from '@/pages/production/ProdPackTypesPage';

// Cooking logs
import CookingLogsPage from '@/pages/cooking/CookingLogsPage';
import CookingLogDetailPage from '@/pages/cooking/CookingLogDetailPage';
import CookingLogFormPage from '@/pages/cooking/CookingLogFormPage';

// Receiving logs
import ReceivingLogsPage from '@/pages/receiving/ReceivingLogsPage';
import ReceivingLogDetailPage from '@/pages/receiving/ReceivingLogDetailPage';
import ReceivingLogFormPage from '@/pages/receiving/ReceivingLogFormPage';

// Cooling logs
import CoolingLogsPage from '@/pages/cooling/CoolingLogsPage';
import CoolingLogDetailPage from '@/pages/cooling/CoolingLogDetailPage';
import CoolingLogFormPage from '@/pages/cooling/CoolingLogFormPage';

// Assembly packing logs
import AssemblyLogsPage from '@/pages/assembly/AssemblyLogsPage';
import AssemblyLogDetailPage from '@/pages/assembly/AssemblyLogDetailPage';

// Sanitising logs
import SanitisingLogsPage from '@/pages/sanitising/SanitisingLogsPage';
import SanitisingLogDetailPage from '@/pages/sanitising/SanitisingLogDetailPage';
import SanitisingLogFormPage from '@/pages/sanitising/SanitisingLogFormPage';

// Deviation logs
import DeviationLogsPage from '@/pages/deviations/DeviationLogsPage';
import DeviationLogDetailPage from '@/pages/deviations/DeviationLogDetailPage';
import DeviationLogFormPage from '@/pages/deviations/DeviationLogFormPage';

// PPE Compliance logs
import PPEComplianceLogsPage from '@/pages/ppe/PPEComplianceLogsPage';
import PPEComplianceLogDetailPage from '@/pages/ppe/PPEComplianceLogDetailPage';
import PPEComplianceLogFormPage from '@/pages/ppe/PPEComplianceLogFormPage';

// Reference data
import SuppliersPage from '@/pages/reference/SuppliersPage';
import EquipmentPage from '@/pages/reference/EquipmentPage';
import AreasPage from '@/pages/reference/AreasPage';

// System management
import UsersPage from '@/pages/users/UsersPage';

// Inventory module
import InventoryItemsPage from '@/pages/inventory/InventoryItemsPage';
import InventoryItemFormPage from '@/pages/inventory/InventoryItemFormPage';
import InventoryLocationsPage from '@/pages/inventory/InventoryLocationsPage';
import InventoryStockDocListPage from '@/pages/inventory/InventoryStockDocListPage';
import InventoryStockDocFormPage from '@/pages/inventory/InventoryStockDocFormPage';
import InventoryStockDocDetailPage from '@/pages/inventory/InventoryStockDocDetailPage';
import InventoryBalancePage from '@/pages/inventory/InventoryBalancePage';
import InventoryStocktakeListPage from '@/pages/inventory/InventoryStocktakeListPage';
import InventoryStocktakePage from '@/pages/inventory/InventoryStocktakePage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes with layout */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<PortalPage />} />
          <Route path="/haccp" element={<DashboardPage />} />
          {/* Production module - Admin, QA, Production */}
          <Route path="/production" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProductionDashboardPage /></RoleGuard>} />
          <Route path="/production/batches" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdBatchListPage /></RoleGuard>} />
          <Route path="/production/batches/new" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdBatchFormPage /></RoleGuard>} />
          <Route path="/production/batches/:id" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdBatchDetailPage /></RoleGuard>} />
          <Route path="/production/batches/:id/packing" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdPackingPage /></RoleGuard>} />
          <Route path="/production/repack" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdRepackListPage /></RoleGuard>} />
          <Route path="/production/repack/new" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdRepackFormPage /></RoleGuard>} />
          <Route path="/production/repack/:id" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdRepackDetailPage /></RoleGuard>} />
          <Route path="/production/products" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdProductsPage /></RoleGuard>} />
          <Route path="/production/pack-types" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Production']}><ProdPackTypesPage /></RoleGuard>} />

          {/* Cooking logs */}
          <Route path="/cooking-logs" element={<CookingLogsPage />} />
          <Route path="/cooking-logs/new" element={<CookingLogFormPage />} />
          <Route path="/cooking-logs/:id" element={<CookingLogDetailPage />} />
          <Route path="/cooking-logs/:id/edit" element={<CookingLogFormPage />} />

          {/* Receiving logs */}
          <Route path="/receiving-logs" element={<ReceivingLogsPage />} />
          <Route path="/receiving-logs/new" element={<ReceivingLogFormPage />} />
          <Route path="/receiving-logs/:id" element={<ReceivingLogDetailPage />} />
          <Route path="/receiving-logs/:id/edit" element={<ReceivingLogFormPage />} />

          {/* Cooling logs */}
          <Route path="/cooling-logs" element={<CoolingLogsPage />} />
          <Route path="/cooling-logs/new" element={<CoolingLogFormPage />} />
          <Route path="/cooling-logs/:id" element={<CoolingLogDetailPage />} />
          <Route path="/cooling-logs/:id/edit" element={<CoolingLogFormPage />} />

          {/* Assembly packing logs */}
          <Route path="/assembly-logs" element={<AssemblyLogsPage />} />
          <Route path="/assembly-logs/:id" element={<AssemblyLogDetailPage />} />

          {/* Sanitising logs */}
          <Route path="/sanitising-logs" element={<SanitisingLogsPage />} />
          <Route path="/sanitising-logs/new" element={<SanitisingLogFormPage />} />
          <Route path="/sanitising-logs/:id" element={<SanitisingLogDetailPage />} />
          <Route path="/sanitising-logs/:id/edit" element={<SanitisingLogFormPage />} />

          {/* PPE Compliance logs */}
          <Route path="/ppe-compliance-logs" element={<PPEComplianceLogsPage />} />
          <Route path="/ppe-compliance-logs/new" element={<PPEComplianceLogFormPage />} />
          <Route path="/ppe-compliance-logs/:id" element={<PPEComplianceLogDetailPage />} />
          <Route path="/ppe-compliance-logs/:id/edit" element={<PPEComplianceLogFormPage />} />

          {/* Deviation logs */}
          <Route path="/deviations" element={<DeviationLogsPage />} />
          <Route path="/deviations/new" element={<DeviationLogFormPage />} />
          <Route path="/deviations/:id" element={<DeviationLogDetailPage />} />

          {/* Reference data */}
          <Route path="/reference/suppliers" element={<SuppliersPage />} />
          <Route path="/reference/equipment" element={<EquipmentPage />} />
          <Route path="/reference/areas" element={<AreasPage />} />

          {/* System management - Admin only */}
          <Route path="/users" element={<RoleGuard allowedRoles={['Admin']}><UsersPage /></RoleGuard>} />

          {/* Inventory module - Admin, QA, Warehouse */}
          <Route path="/inventory/balance" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryBalancePage /></RoleGuard>} />
          <Route path="/inventory/docs" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryStockDocListPage /></RoleGuard>} />
          <Route path="/inventory/docs/new" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryStockDocFormPage /></RoleGuard>} />
          <Route path="/inventory/docs/:id" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryStockDocDetailPage /></RoleGuard>} />
          <Route path="/inventory/docs/:id/edit" element={<RoleGuard allowedRoles={['Admin', 'Warehouse']}><InventoryStockDocFormPage /></RoleGuard>} />
          <Route path="/inventory/items" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryItemsPage /></RoleGuard>} />
          <Route path="/inventory/items/new" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryItemFormPage /></RoleGuard>} />
          <Route path="/inventory/items/:id/edit" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryItemFormPage /></RoleGuard>} />
          <Route path="/inventory/locations" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryLocationsPage /></RoleGuard>} />
          <Route path="/inventory/stocktakes" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryStocktakeListPage /></RoleGuard>} />
          <Route path="/inventory/stocktakes/new" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryStocktakePage /></RoleGuard>} />
          <Route path="/inventory/stocktakes/:id" element={<RoleGuard allowedRoles={['Admin', 'QA', 'Warehouse']}><InventoryStocktakePage /></RoleGuard>} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
