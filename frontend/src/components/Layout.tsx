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
      <main className={`pt-16 pb-10 ${isPortal ? '' : 'lg:pl-64'}`}>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className={`fixed bottom-0 right-0 left-0 ${isPortal ? '' : 'lg:left-64'} bg-gray-50 border-t border-gray-100 py-2 px-4 text-center text-xs text-gray-400`}>
        FD Catering HACCP System v2.0.0
      </footer>
    </div>
  );
}
