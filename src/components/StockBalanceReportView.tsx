import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Calendar,
  Filter,
  RefreshCw,
  Printer,
  Download,
} from 'lucide-react';
import { api } from '../api';
import { StockBalanceReportData, Settings } from '../types';
import { exportStockBalanceCsv } from '../utils/csvExport';

interface StockBalanceReportViewProps {
  settings: Settings;
}

export const StockBalanceReportView: React.FC<StockBalanceReportViewProps> = ({ settings }) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const [report, setReport] = useState<StockBalanceReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [batchId, setBatchId] = useState('');

  const loadReport = async () => {
    setIsLoading(true);
    try {
      const data = await api.getStockBalanceReport({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        batch_id: batchId || undefined,
      });
      setReport(data);
    } catch (err) {
      console.error('Failed to load stock balance report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [startDate, endDate, batchId]);

  const summary = report?.summary;
  const batches = report?.batches || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stock Balance & Valuation Report</h2>
          <p className="text-sm text-slate-500">
            Comprehensive inventory balance, weighted purchase cost, and batch-wise valuation for{' '}
            <span className="font-semibold text-slate-700">{settings?.product_name || 'Product'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            id="btn-export-stock-report-csv"
            disabled={!report}
            onClick={() => report && exportStockBalanceCsv(report, settings)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            title="Export stock balance and FIFO valuation report to CSV"
          >
            <Download className="w-3.5 h-3.5 text-purple-600" />
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
            onClick={loadReport}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics: Opening, Purchased, Sold, Closing, Value, Weighted Avg Cost */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Opening Stock</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-slate-800 font-mono">{summary.openingStock.toLocaleString()}</span>
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400">Prior to selected period</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Purchased</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-blue-700 font-mono">+{summary.totalPurchased.toLocaleString()}</span>
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400">Inbound new stock</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Sold</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-emerald-700 font-mono">-{summary.totalSold.toLocaleString()}</span>
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400">Outbound to customers</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
            <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider block">Closing Stock</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-blue-950 font-mono">{summary.closingStock.toLocaleString()}</span>
              <span className="text-xs text-blue-800 font-semibold">{unit}</span>
            </div>
            <span className="text-[10px] text-blue-700 font-medium">Currently available</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Stock Value</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {summary.totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Sum of (Batch Qty × Unit Cost)</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Weighted Avg Cost</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-indigo-700 font-mono">
                {summary.averagePurchaseCost.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">/{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400">Total Value / Total Qty</span>
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600 font-medium">Period:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600 font-medium">Batch Filter:</span>
            <input
              type="text"
              placeholder="Search batch..."
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 uppercase font-mono"
            />
          </div>
        </div>

        {(startDate || endDate || batchId) && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setBatchId('');
            }}
            className="text-blue-600 hover:underline font-medium text-xs"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Batch-Wise Stock Report Table required by Section 11 */}
      {/* Table: Batch Number | Purchased Qty | Sold Qty | Remaining Qty | Purchase Price | Remaining Stock Value */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Batch-Wise Stock Accounting & Valuation
          </h3>
          <span className="text-xs text-slate-500">Each batch purchased at its distinct unit price</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Batch Number</th>
                <th className="px-4 py-3.5">Purchase Date</th>
                <th className="px-4 py-3.5 text-right">Purchased Qty</th>
                <th className="px-4 py-3.5 text-right">Sold Qty</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-blue-300">Remaining Qty</th>
                <th className="px-4 py-3.5 text-right">Purchase Price / {unit}</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-emerald-300">Remaining Stock Value</th>
                <th className="px-4 py-3.5 text-center">Batch Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No batches match the criteria.
                  </td>
                </tr>
              ) : (
                batches.map((b) => {
                  const isActive = b.remaining_qty > 0;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold font-mono text-slate-900">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-mono">
                          {b.batch_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{b.purchase_date}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {b.purchased_qty.toLocaleString()} {unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {b.sold_qty.toLocaleString()} {unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>
                          {b.remaining_qty.toLocaleString()} {unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-800">
                        {cur}{b.unit_cost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {cur}{b.remaining_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {isActive ? 'Active' : 'Exhausted'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {summary && batches.length > 0 && (
              <tfoot className="bg-slate-50/80 font-bold border-t border-slate-200 text-slate-900">
                <tr>
                  <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-[11px] text-slate-600">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {summary.totalPurchased.toLocaleString()} {unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {summary.totalSold.toLocaleString()} {unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-blue-900">
                    {summary.closingStock.toLocaleString()} {unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-700">
                    Avg: {cur}{summary.averagePurchaseCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    {cur}{summary.totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center text-[10px] text-slate-500">
                    {batches.filter((b) => b.remaining_qty > 0).length} Active
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
