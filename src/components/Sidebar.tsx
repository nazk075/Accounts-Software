import React from 'react';
import {
  LayoutDashboard,
  PackagePlus,
  Boxes,
  ShoppingCart,
  Users,
  Wallet,
  BookOpen,
  BarChart3,
  TrendingUp,
  Settings as SettingsIcon,
  Package,
  FileSpreadsheet,
} from 'lucide-react';
import { ActiveTab, ActiveView, Settings } from '../types';

interface SidebarProps {
  currentTab?: ActiveTab;
  activeView?: ActiveView;
  onSelectTab?: (tab: ActiveTab) => void;
  onSelectView?: (view: ActiveView) => void;
  settings?: Settings;
  onOpenSettings: () => void;
  onOpenExport?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  activeView,
  onSelectTab,
  onSelectView,
  settings,
  onOpenSettings,
  onOpenExport,
}) => {
  const active: ActiveTab = currentTab || activeView || 'dashboard';

  const handleSelect = (tab: ActiveTab) => {
    if (onSelectTab) {
      onSelectTab(tab);
    }
    if (onSelectView) {
      onSelectView(tab);
    }
  };

  const productName = settings?.product_name || 'Commercial Grade Coffee Beans (1kg Bag)';

  const navSections = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard' as ActiveTab, label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'STOCK & INVENTORY',
      items: [
        { id: 'purchase-entry' as ActiveTab, label: 'Add Stock (Purchases)', icon: PackagePlus, badge: '+ In' },
        { id: 'batch-inventory' as ActiveTab, label: 'Stock Batches', icon: Boxes },
        { id: 'item-ledger' as ActiveTab, label: 'Stock Movement', icon: BookOpen },
      ],
    },
    {
      title: 'SALES & PAYMENTS',
      items: [
        { id: 'sales-entry' as ActiveTab, label: 'Sales & Orders', icon: ShoppingCart, badge: '- Out' },
        { id: 'daily-collection' as ActiveTab, label: 'Receive Payments', icon: Wallet },
        { id: 'customers' as ActiveTab, label: 'Customers', icon: Users },
      ],
    },
    {
      title: 'REPORTS',
      items: [
        { id: 'profit-report' as ActiveTab, label: 'Profit & Margins', icon: TrendingUp },
        { id: 'stock-report' as ActiveTab, label: 'Stock Valuation', icon: BarChart3 },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col h-screen border-r border-slate-800 flex-shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold text-lg">
            1P
          </div>
          <div>
            <h1 className="font-semibold text-sm text-white leading-tight">OneProduct ERP</h1>
            <p className="text-[11px] text-slate-400">Single-Product Manager</p>
          </div>
        </div>

        {/* Current product card */}
        <div className="mt-3.5 px-2.5 py-2 bg-slate-800/80 rounded-md border border-slate-700/60 flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Product</p>
            <p className="text-xs text-slate-100 font-medium truncate" title={productName}>
              {productName}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                          isActive
                            ? 'bg-emerald-700 text-emerald-100'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-900/60">
        <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Sync Active
          </span>
          <span className="text-[10px] text-slate-500">Auto-Ledger</span>
        </div>

        {onOpenExport && (
          <button
            id="sidebar-btn-export"
            onClick={onOpenExport}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 hover:text-emerald-300 text-xs border border-emerald-800/60 transition-colors font-medium"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Data (CSV)</span>
          </button>
        )}

        <button
          id="btn-open-settings"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs border border-slate-700/80 transition-colors"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Settings & Demo Data</span>
        </button>
      </div>
    </aside>
  );
};
