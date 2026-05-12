// src/components/layout/Layout.jsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileDrawer from './MobileDrawer';

export default function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Sidebar — widoczny tylko md+ */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Drawer mobile */}
      <MobileDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      {/* Główny obszar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuToggle={() => setIsMenuOpen(prev => !prev)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
