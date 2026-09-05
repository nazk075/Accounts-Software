import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
  Package,
  ShoppingCart,
  PackagePlus,
  Wallet,
  Settings as SettingsIcon,
  RefreshCw,
  Plus,
  ChevronDown,
  Users,
  FileSpreadsheet,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { PurchaseEntryView } from './components/PurchaseEntryView';
import { BatchInventoryView } from './components/BatchInventoryView';
import { SalesEntryView } from './components/SalesEntryView';
import { CustomersView } from './components/CustomersView';
import { CustomerAccountView } from './components/CustomerAccountView';
import { DailyCollectionEntryView } from './components/DailyCollectionEntryView';
import { ItemLedgerView } from './components/ItemLedgerView';
import { StockBalanceReportView } from './components/StockBalanceReportView';
import { ProfitReportView } from './components/ProfitReportView';
import { SettingsModal } from './components/SettingsModal';
import { ExportCenterModal } from './components/ExportCenterModal';
import { api } from './api';
import { ActiveTab, Settings } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [settings, setSettings] = useState<Settings>({
    product_name: 'Commercial Grade Coffee Beans',
    currency_symbol: '$',
    unit_name: 'Units',
  });

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      if (data && data.product_name) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleOpenCustomer = (id: number) => {
    setSelectedCustomerId(id);
    setCurrentTab('customer-detail');
  };

  const handleRecordSaleForCustomer = (id: number) => {
    setCurrentTab('sales-entry');
  };

  const handleTabChange = (tab: ActiveTab) => {
    setCurrentTab(tab);
    setIsMobileMenuOpen(false);
  };

  // Helper titles for top bar
  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Business Dashboard';
      case 'purchase-entry':
        return 'Add Stock (Purchases)';
      case 'batch-inventory':
        return 'Stock Batches & Inventory';
      case 'sales-entry':
        return 'Sales & Orders';
      case 'customers':
        return 'Customers & Balances';
      case 'customer-detail':
        return 'Customer Account Statement';
      case 'daily-collection':
        return 'Receive Payments';
      case 'item-ledger':
        return 'Stock Movement Ledger';
      case 'stock-report':
        return 'Stock Valuation Report';
      case 'profit-report':
        return 'Profit & Margins Report';
      default:
        return 'Business Management';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar for Desktop and Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          currentTab={currentTab}
          activeView={currentTab}
          onSelectTab={handleTabChange}
          onSelectView={handleTabChange}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenExport={() => setIsExportModalOpen(true)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden"
              aria-label="Toggle Navigation"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {getTabTitle()}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <Package className="w-3 h-3 text-blue-600" />
                  <span>{settings?.product_name || 'Commercial Grade Coffee Beans'}</span>
                </span>
                <span>•</span>
                <span>Single-Product System</span>
              </div>
            </div>
          </div>

          {/* Quick Header Actions Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative" ref={actionMenuRef}>
              <button
                id="header-btn-action-menu"
                onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
                title="Quick entry options"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ New Entry</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isActionMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      setCurrentTab('sales-entry');
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                    <span>New Sale Order</span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrentTab('purchase-entry');
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-blue-600" />
                    <span>New Purchase (Stock)</span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrentTab('daily-collection');
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                  >
                    <Wallet className="w-3.5 h-3.5 text-teal-600" />
                    <span>Receive Collections</span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  <button
                    onClick={() => {
                      setCurrentTab('customers');
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Customers & Ledgers</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsExportModalOpen(true);
                      setIsActionMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export CSV Reports</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="System Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && (
              <DashboardView
                key={`dash-${refreshTrigger}`}
                settings={settings}
                onNavigateToBatches={() => setCurrentTab('batch-inventory')}
                onNavigateToSales={() => setCurrentTab('sales-entry')}
                onNavigateToCollections={() => setCurrentTab('daily-collection')}
                onNavigateToCustomers={() => setCurrentTab('customers')}
                onNavigateToCustomer={handleOpenCustomer}
                onNavigateToProfitReport={() => setCurrentTab('profit-report')}
                onNavigateToStockReport={() => setCurrentTab('stock-report')}
                onOpenExport={() => setIsExportModalOpen(true)}
              />
            )}

            {currentTab === 'purchase-entry' && (
              <PurchaseEntryView
                settings={settings}
                onPurchaseSuccess={triggerRefresh}
                onNavigateToBatches={() => setCurrentTab('batch-inventory')}
              />
            )}

            {currentTab === 'batch-inventory' && (
              <BatchInventoryView
                key={`batch-${refreshTrigger}`}
                settings={settings}
                onNavigateToPurchase={() => setCurrentTab('purchase-entry')}
              />
            )}

            {currentTab === 'sales-entry' && (
              <SalesEntryView
                key={`sales-${refreshTrigger}`}
                settings={settings}
                onSalesSaved={triggerRefresh}
                onNavigateToCustomer={handleOpenCustomer}
              />
            )}

            {currentTab === 'customers' && (
              <CustomersView
                key={`cust-${refreshTrigger}`}
                settings={settings}
                onOpenCustomerAccount={handleOpenCustomer}
                onNavigateToCollection={() => setCurrentTab('daily-collection')}
              />
            )}

            {currentTab === 'customer-detail' && selectedCustomerId && (
              <CustomerAccountView
                key={`cust-detail-${selectedCustomerId}-${refreshTrigger}`}
                customerId={selectedCustomerId}
                settings={settings}
                onBack={() => setCurrentTab('customers')}
                onRecordSaleForCustomer={handleRecordSaleForCustomer}
              />
            )}

            {currentTab === 'daily-collection' && (
              <DailyCollectionEntryView
                key={`collect-${refreshTrigger}`}
                settings={settings}
                onCollectionsSaved={triggerRefresh}
                onNavigateToCustomer={handleOpenCustomer}
              />
            )}

            {currentTab === 'item-ledger' && (
              <ItemLedgerView key={`item-ledger-${refreshTrigger}`} settings={settings} />
            )}

            {currentTab === 'stock-report' && (
              <StockBalanceReportView key={`stock-rep-${refreshTrigger}`} settings={settings} />
            )}

            {currentTab === 'profit-report' && (
              <ProfitReportView
                key={`profit-rep-${refreshTrigger}`}
                settings={settings}
                onNavigateToCustomer={handleOpenCustomer}
              />
            )}
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDataReset={() => {
          loadSettings();
          triggerRefresh();
          setCurrentTab('dashboard');
        }}
        onSettingsUpdated={(newSettings) => {
          if (newSettings && newSettings.product_name) {
            setSettings(newSettings);
          }
          triggerRefresh();
        }}
      />

      {/* Global Data Export Center Modal */}
      <ExportCenterModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        settings={settings}
      />
    </div>
  );
}
