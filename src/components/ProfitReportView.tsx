import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Calendar,
  Filter,
  RefreshCw,
  Printer,
  Download,
} from 'lucide-react';
import { api } from '../api';
import { ProfitReportData, Customer, Settings } from '../types';
import { exportProfitReportCsv } from '../utils/csvExport';

interface ProfitReportViewProps {
  settings: Settings;
  onNavigateToCustomer: (customerId: number) => void;
}

export const ProfitReportView: React.FC<ProfitReportViewProps> = ({
  settings,
  onNavigateToCustomer,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const [report, setReport] = useState<ProfitReportData | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter presets: TODAY, THIS_MONTH, ALL, CUSTOM
  const [preset, setPreset] = useState<'ALL' | 'TODAY' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSelectPreset = (p: 'ALL' | 'TODAY' | 'THIS_MONTH' | 'CUSTOM') => {
    setPreset(p);
    const now = new Date();
    if (p === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (p === 'THIS_MONTH') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = `${year}-${month}-01`;
      setStartDate(startOfMonth);
      setEndDate(todayStr);
    } else if (p === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [repData, custList] = await Promise.all([
        api.getProfitReport({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          customerId: selectedCustomerId !== 'ALL' ? selectedCustomerId : undefined,
        }),
        api.getCustomers(),
      ]);
      setReport(repData);
      setCustomers(custList);
    } catch (err) {
      console.error('Failed to load profit report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, selectedCustomerId]);

  const summary = report?.summary;
  const sales = report?.sales || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sales & Profit Report</h2>
          <p className="text-sm text-slate-500">
            Real-time profitability calculated from actual batch purchase costs for{' '}
            <span className="font-semibold text-slate-700">{settings?.product_name || 'Product'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            id="btn-export-profit-report-csv"
            disabled={!report}
            onClick={() => report && exportProfitReportCsv(report, settings)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            title="Export profit margins and batch allocations report to CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Totals & Summary KPI Cards specified in Section 13 */}
      {/* Total Sales, Total Purchase Cost, Total Profit, Average Selling Price */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Total Sales */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Sales</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {summary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Total gross turnover</span>
          </div>

          {/* Total Purchase Cost */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Purchase Cost</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-slate-700 font-mono">
                {summary.totalPurchaseCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Actual batch acquisition cost</span>
          </div>

          {/* Total Profit */}
          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/25 shadow-sm">
            <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider block">Total Profit</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-emerald-700 font-bold">{cur}</span>
              <span className="text-xl font-bold text-emerald-800 font-mono">
                {summary.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Sales - Actual Batch Cost</span>
          </div>

          {/* Average Selling Price */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Avg Selling Price</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-blue-700 font-mono">
                {summary.averageSellingPrice.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">/{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400">Total Sales / Total Qty Sold</span>
          </div>

          {/* Margin % */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Overall Margin</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-slate-900 font-mono">
                {summary.overallMarginPercent.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-500">gross</span>
            </div>
            <span className="text-[10px] text-slate-400">
              {summary.totalQuantitySold} {unit} sold total
            </span>
          </div>
        </div>
      )}

      {/* Filter Presets Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        {/* Preset quick buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 font-medium mr-1">Timeframe:</span>
          {(['ALL', 'TODAY', 'THIS_MONTH', 'CUSTOM'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handleSelectPreset(p)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                preset === p
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p === 'ALL' ? 'All Time' : p === 'TODAY' ? 'Today' : p === 'THIS_MONTH' ? 'This Month' : 'Custom Range'}
            </button>
          ))}
        </div>

        {/* Date Inputs & Customer select */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset('CUSTOM');
                setStartDate(e.target.value);
              }}
              className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset('CUSTOM');
                setEndDate(e.target.value);
              }}
              className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 bg-white"
            >
              <option value="ALL">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Profit Table specified in Section 12 */}
      {/* Table: Date | Customer | Quantity | Sales Amount | Purchase Cost | Profit | Margin % */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Transaction-by-Transaction Profit Breakdown
          </h3>
          <span className="text-xs text-slate-500">Computed strictly against individual batch costs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Batch Breakdown</th>
                <th className="px-4 py-3.5 text-right">Quantity</th>
                <th className="px-4 py-3.5 text-right">Sales Amount</th>
                <th className="px-4 py-3.5 text-right">Purchase Cost</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-emerald-300">Profit</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-teal-300">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No sales recorded for the selected filter period.
                  </td>
                </tr>
              ) : (
                sales.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 text-slate-600">{item.date}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <button
                        onClick={() => onNavigateToCustomer(item.customer_id)}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {item.customer_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono">
                        {item.batchesUsed || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-800">
                      {item.quantity} {unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {cur}{item.total_sales.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {cur}{item.total_cost.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      +{cur}{item.profit.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                      {item.margin_percent.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {summary && sales.length > 0 && (
              <tfoot className="bg-slate-50/80 font-bold border-t border-slate-200 text-slate-900">
                <tr>
                  <td colSpan={3} className="px-4 py-3 uppercase tracking-wider text-[11px] text-slate-600">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">
                    {summary.totalQuantitySold} {unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    {cur}{summary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    {cur}{summary.totalPurchaseCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700 font-bold">
                    +{cur}{summary.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    {summary.overallMarginPercent.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
