import React, { useState, useEffect } from 'react';
import {
  Boxes,
  DollarSign,
  TrendingUp,
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Plus,
  PackagePlus,
  RefreshCw,
  AlertCircle,
  Truck,
  PackageCheck,
  FileSpreadsheet,
  Phone,
  MapPin,
  FileText,
  Search,
  Users,
  ChevronRight,
} from 'lucide-react';
import { api } from '../api';
import { DashboardData, Customer, Settings } from '../types';

interface DashboardViewProps {
  settings: Settings;
  onNavigateToBatches: () => void;
  onNavigateToSales: () => void;
  onNavigateToCollections: () => void;
  onNavigateToCustomers: () => void;
  onNavigateToCustomer: (customerId: number) => void;
  onNavigateToProfitReport: () => void;
  onNavigateToStockReport?: () => void;
  onOpenExport?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  onNavigateToBatches,
  onNavigateToSales,
  onNavigateToCollections,
  onNavigateToCustomers,
  onNavigateToCustomer,
  onNavigateToProfitReport,
  onNavigateToStockReport,
  onOpenExport,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const [data, setData] = useState<DashboardData | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilterTab, setCustomerFilterTab] = useState<'all' | 'due' | 'pending'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [dashResult, custList] = await Promise.all([
        api.getDashboard(),
        api.getCustomers(),
      ]);
      setData(dashResult);
      setCustomers(custList || []);
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-1"></div>
            <div className="h-4 w-64 bg-slate-100 rounded animate-pulse"></div>
          </div>
        </div>
        <div className="h-48 bg-slate-100 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-3 max-w-md mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Failed to load dashboard</h3>
        <p className="text-xs text-slate-500">{error || 'Unknown error occurred while connecting to database.'}</p>
        <button
          onClick={loadDashboard}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  // Filtered customer accounts for the highlighted dashboard table
  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase();
    const match =
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q));
    if (!match) return false;

    if (customerFilterTab === 'due') return c.outstanding_balance > 0;
    if (customerFilterTab === 'pending') return (c.total_pending_quantity || 0) > 0;
    return true;
  });

  const dueCount = customers.filter((c) => c.outstanding_balance > 0).length;
  const pendingDeliveriesCount = customers.filter((c) => (c.total_pending_quantity || 0) > 0).length;

  return (
    <div className="space-y-5">
      {/* Top Bar with Title and Compact Corner Statistics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Operations Dashboard</h2>
            <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full border border-blue-200">
              {settings?.product_name || 'Single-Product'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time stock, orders, deliveries, customer ledgers, and cash collections
          </p>
        </div>

        {/* Small/Compact Corner Dashboard Statistics (Customer Sales, Outstanding Balance, Stock, Profit) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Total Customer Sales (Small Corner Stat) */}
          <div
            onClick={onNavigateToSales}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs border border-slate-200 cursor-pointer shadow-2xs transition-all"
            title="Total Customer Sales Invoiced"
          >
            <span className="text-slate-500 font-medium">Customer Sales:</span>
            <span className="font-bold font-mono text-slate-900">
              {cur}{data.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Total Outstanding Balance (Small Corner Stat - Highlighted) */}
          <div
            onClick={onNavigateToCustomers}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border cursor-pointer shadow-2xs transition-all ${
              data.totalCustomerOutstanding > 0
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 font-bold'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Total Customer Outstanding Balance (Click to view ledgers)"
          >
            <span className={data.totalCustomerOutstanding > 0 ? 'text-rose-700 font-medium' : 'text-slate-500 font-medium'}>
              Outstanding Balance:
            </span>
            <span className="font-mono text-rose-800 font-bold">
              {cur}{data.totalCustomerOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {dueCount > 0 && (
              <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded-full font-mono">
                {dueCount}
              </span>
            )}
          </div>

          {/* Total Available Stock (Small Corner Stat) */}
          <div
            onClick={onNavigateToBatches}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg text-xs border border-blue-200 cursor-pointer shadow-2xs transition-all"
            title="Total available inventory"
          >
            <span className="text-blue-700 font-medium">In Stock:</span>
            <span className="font-bold font-mono text-blue-950">
              {data.totalStockAvailable.toLocaleString()} {unit}
            </span>
          </div>

          {/* Total Profit (Small Corner Stat) */}
          <div
            onClick={onNavigateToProfitReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs border border-emerald-200 cursor-pointer shadow-2xs transition-all"
            title="Net Realized Profit"
          >
            <span className="text-emerald-700 font-medium">Profit:</span>
            <span className="font-bold font-mono text-emerald-800">
              {cur}{data.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <button
            id="btn-refresh-dashboard"
            onClick={loadDashboard}
            disabled={isLoading}
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* CUSTOMER ACCOUNTS & BALANCES TABLE (Excel Sheet Layout) */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-hidden">
        {/* Table Control Header */}
        <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Customer Accounts & Balances
            </h3>
            <span className="text-[11px] bg-white text-slate-600 px-2 py-0.5 rounded border border-slate-200">
              {customers.length} Accounts
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCustomerFilterTab('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  customerFilterTab === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All ({customers.length})
              </button>
              <button
                onClick={() => setCustomerFilterTab('due')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  customerFilterTab === 'due'
                    ? 'bg-rose-700 text-white'
                    : 'bg-white text-rose-700 hover:bg-rose-50 border border-slate-200'
                }`}
              >
                <span>Balance Due</span>
                {dueCount > 0 && (
                  <span className="px-1 text-[10px] rounded bg-rose-100 text-rose-800 font-mono">
                    {dueCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setCustomerFilterTab('pending')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  customerFilterTab === 'pending'
                    ? 'bg-amber-700 text-white'
                    : 'bg-white text-amber-800 hover:bg-amber-50 border border-slate-200'
                }`}
              >
                <span>Pending Units</span>
                {pendingDeliveriesCount > 0 && (
                  <span className="px-1 text-[10px] rounded bg-amber-100 text-amber-900 font-mono">
                    {pendingDeliveriesCount}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 rounded border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <button
              onClick={onNavigateToCustomers}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 ml-1"
            >
              <span>All Customers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Excel Spreadsheet Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
              <tr>
                <th className="px-3.5 py-2.5 border-r border-slate-200">Customer Name</th>
                <th className="px-3.5 py-2.5 border-r border-slate-200">Contact Details</th>
                <th className="px-3.5 py-2.5 text-right border-r border-slate-200">Total Invoiced</th>
                <th className="px-3.5 py-2.5 text-center border-r border-slate-200">Delivery Fulfillment</th>
                <th className="px-3.5 py-2.5 text-right border-r border-slate-200">Total Collections</th>
                <th className="px-3.5 py-2.5 text-right border-r border-slate-200 bg-slate-100 text-slate-800">Balance to Pay</th>
                <th className="px-3.5 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-6 text-center text-slate-400 bg-slate-50">
                    No customers found matching filter.
                  </td>
                </tr>
              ) : (
                filteredCustomers.slice(0, 10).map((c) => {
                  const hasDue = c.outstanding_balance > 0;
                  const delivered = c.total_delivered_quantity || 0;
                  const pending = c.total_pending_quantity || 0;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onNavigateToCustomer(c.id)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer even:bg-slate-50/40"
                    >
                      {/* Customer Name */}
                      <td className="px-3.5 py-2 border-r border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 hover:text-blue-700">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            #{c.id}
                          </span>
                        </div>
                      </td>

                      {/* Contact Details */}
                      <td className="px-3.5 py-2 border-r border-slate-200 text-slate-600">
                        <span className="font-mono">{c.phone || '—'}</span>
                        {c.address && <span className="text-slate-400 text-[11px] ml-2">({c.address})</span>}
                      </td>

                      {/* Total Invoiced */}
                      <td className="px-3.5 py-2 text-right font-mono text-slate-900 border-r border-slate-200">
                        {cur}{c.total_sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Delivery Fulfillment */}
                      <td className="px-3.5 py-2 text-center border-r border-slate-200">
                        {pending > 0 ? (
                          <span className="text-amber-800 font-medium">
                            {pending.toLocaleString()} {unit} Pending
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            Fulfilled
                          </span>
                        )}
                      </td>

                      {/* Total Collections */}
                      <td className="px-3.5 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                        {cur}{c.total_collections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Balance to Pay */}
                      <td className="px-3.5 py-2 text-right font-mono border-r border-slate-200 bg-slate-50/50">
                        {hasDue ? (
                          <span className="font-bold text-rose-700">
                            {cur}{c.outstanding_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono">
                            {cur}0.00
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onNavigateToCustomer(c.id)}
                            className="px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50 rounded border border-slate-300 font-medium transition-colors"
                            title="Open Statement"
                          >
                            Statement
                          </button>

                          {hasDue && (
                            <button
                              onClick={onNavigateToCollections}
                              className="px-2 py-0.5 text-xs text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-300 font-medium transition-colors"
                              title="Record payment collection"
                            >
                              + Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with full directory link if more than 10 customers */}
        {filteredCustomers.length > 10 && (
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-center">
            <button
              onClick={onNavigateToCustomers}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Showing 10 of {filteredCustomers.length} customers • View Complete Customer Accounts Directory →
            </button>
          </div>
        )}
      </div>

      {/* 2 Operational Sections: Recent Sales & Recent Stock Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Sales Table */}
        <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Recent Invoiced Sales</h3>
            </div>
            <button 
              onClick={onNavigateToSales}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              All Sales →
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 border-r border-slate-200">Customer</th>
                  <th className="px-3 py-2 border-r border-slate-200">Date</th>
                  <th className="px-3 py-2 text-right border-r border-slate-200">Qty</th>
                  <th className="px-3 py-2 text-right border-r border-slate-200">Total</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">No sales recorded yet.</td>
                  </tr>
                ) : (
                  data.recentSales.slice(0, 6).map((s) => (
                    <tr key={s.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2 border-r border-slate-200 font-medium text-slate-900 truncate max-w-[140px]">
                        <span 
                          onClick={() => onNavigateToCustomer(s.customer_id)}
                          className="hover:text-blue-700 cursor-pointer"
                        >
                          {s.customer_name}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r border-slate-200 text-slate-500 font-mono text-[11px]">
                        {s.date}
                      </td>
                      <td className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-700">
                        {s.quantity} {unit}
                      </td>
                      <td className="px-3 py-2 text-right border-r border-slate-200 font-mono font-semibold text-slate-900">
                        {cur}{s.total_sales.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center text-[11px]">
                        {(s.balance_due || 0) > 0 ? (
                          <span className="text-rose-700 font-medium font-mono">
                            Due: {cur}{s.balance_due?.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            Paid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Stock Purchases Table */}
        <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Recent Stock Purchases</h3>
            </div>
            <button 
              onClick={onNavigateToBatches}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Inventory Batches →
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 border-r border-slate-200">Batch #</th>
                  <th className="px-3 py-2 border-r border-slate-200">Date</th>
                  <th className="px-3 py-2 text-right border-r border-slate-200">Qty</th>
                  <th className="px-3 py-2 text-right border-r border-slate-200">Cost/Unit</th>
                  <th className="px-3 py-2 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">No stock batches added yet.</td>
                  </tr>
                ) : (
                  data.recentPurchases.slice(0, 6).map((p) => (
                    <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2 border-r border-slate-200 font-mono font-semibold text-blue-700">
                        {p.batch_number}
                      </td>
                      <td className="px-3 py-2 border-r border-slate-200 text-slate-500 font-mono text-[11px]">
                        {p.date}
                      </td>
                      <td className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-700">
                        {p.quantity} {unit}
                      </td>
                      <td className="px-3 py-2 text-right border-r border-slate-200 font-mono text-slate-700">
                        {cur}{p.unit_purchase_price.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                        {cur}{p.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
