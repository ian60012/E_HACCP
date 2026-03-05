import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar';
import Sidebar from './Sidebar';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const isPortal = pathname === '/';

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar onMenuClick={() => setSidebarOpen(true)} />
      {!isPortal && <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}

      {/* Main content area */}
      <main className={`pt-16 ${isPortal ? '' : 'lg:pl-64'}`}>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
