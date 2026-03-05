import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
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

// Sanitising logs
import SanitisingLogsPage from '@/pages/sanitising/SanitisingLogsPage';
import SanitisingLogDetailPage from '@/pages/sanitising/SanitisingLogDetailPage';
import SanitisingLogFormPage from '@/pages/sanitising/SanitisingLogFormPage';

// Assembly logs
import AssemblyLogsPage from '@/pages/assembly/AssemblyLogsPage';
import AssemblyLogDetailPage from '@/pages/assembly/AssemblyLogDetailPage';
import AssemblyLogFormPage from '@/pages/assembly/AssemblyLogFormPage';

// Deviation logs
import DeviationLogsPage from '@/pages/deviations/DeviationLogsPage';
import DeviationLogDetailPage from '@/pages/deviations/DeviationLogDetailPage';
import DeviationLogFormPage from '@/pages/deviations/DeviationLogFormPage';

// Reference data
import ProductsPage from '@/pages/reference/ProductsPage';
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
          {/* Production module */}
          <Route path="/production" element={<ProductionDashboardPage />} />
          <Route path="/production/batches" element={<ProdBatchListPage />} />
          <Route path="/production/batches/new" element={<ProdBatchFormPage />} />
          <Route path="/production/batches/:id" element={<ProdBatchDetailPage />} />
          <Route path="/production/batches/:id/packing" element={<ProdPackingPage />} />
          <Route path="/production/repack" element={<ProdRepackListPage />} />
          <Route path="/production/repack/new" element={<ProdRepackFormPage />} />
          <Route path="/production/repack/:id" element={<ProdRepackDetailPage />} />
          <Route path="/production/products" element={<ProdProductsPage />} />
          <Route path="/production/pack-types" element={<ProdPackTypesPage />} />

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

          {/* Sanitising logs */}
          <Route path="/sanitising-logs" element={<SanitisingLogsPage />} />
          <Route path="/sanitising-logs/new" element={<SanitisingLogFormPage />} />
          <Route path="/sanitising-logs/:id" element={<SanitisingLogDetailPage />} />
          <Route path="/sanitising-logs/:id/edit" element={<SanitisingLogFormPage />} />

          {/* Assembly logs */}
          <Route path="/assembly-logs" element={<AssemblyLogsPage />} />
          <Route path="/assembly-logs/new" element={<AssemblyLogFormPage />} />
          <Route path="/assembly-logs/:id" element={<AssemblyLogDetailPage />} />
          <Route path="/assembly-logs/:id/edit" element={<AssemblyLogFormPage />} />

          {/* Deviation logs */}
          <Route path="/deviations" element={<DeviationLogsPage />} />
          <Route path="/deviations/new" element={<DeviationLogFormPage />} />
          <Route path="/deviations/:id" element={<DeviationLogDetailPage />} />

          {/* Reference data */}
          <Route path="/reference/products" element={<ProductsPage />} />
          <Route path="/reference/suppliers" element={<SuppliersPage />} />
          <Route path="/reference/equipment" element={<EquipmentPage />} />
          <Route path="/reference/areas" element={<AreasPage />} />

          {/* System management */}
          <Route path="/users" element={<UsersPage />} />

          {/* Inventory module */}
          <Route path="/inventory/balance" element={<InventoryBalancePage />} />
          <Route path="/inventory/docs" element={<InventoryStockDocListPage />} />
          <Route path="/inventory/docs/new" element={<InventoryStockDocFormPage />} />
          <Route path="/inventory/docs/:id" element={<InventoryStockDocDetailPage />} />
          <Route path="/inventory/items" element={<InventoryItemsPage />} />
          <Route path="/inventory/items/new" element={<InventoryItemFormPage />} />
          <Route path="/inventory/items/:id/edit" element={<InventoryItemFormPage />} />
          <Route path="/inventory/locations" element={<InventoryLocationsPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
