import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, Filter, RefreshCw, ArrowDownRight, ArrowUpRight, Boxes, Download } from 'lucide-react';
import { api } from '../api';
import { ItemLedgerEntry, Settings, StockBatch } from '../types';
import { exportItemLedgerCsv } from '../utils/csvExport';

interface ItemLedgerViewProps {
  settings: Settings;
}

export const ItemLedgerView: React.FC<ItemLedgerViewProps> = ({ settings }) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const [entries, setEntries] = useState<ItemLedgerEntry[]>([]);
  const [summary, setSummary] = useState<{ totalStockIn: number; totalStockOut: number; currentStock: number } | null>(null);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PURCHASE' | 'SALE'>('ALL');
  const [batchFilter, setBatchFilter] = useState<string>('ALL');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ledgerRes, batchRes] = await Promise.all([
        api.getItemLedger({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          batch_id: batchFilter !== 'ALL' ? batchFilter : undefined,
        }),
        api.getBatches(),
      ]);
      setEntries(ledgerRes.entries);
      setSummary(ledgerRes.summary);
      setBatches(batchRes.batches);
    } catch (err) {
      console.error('Failed to load item ledger:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, typeFilter, batchFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Item Ledger (Stock Movement)</h2>
          <p className="text-sm text-slate-500">
            Audit trail of every stock entry: Purchases (Stock In) and Sales (Stock Out) for{' '}
            <span className="font-semibold text-slate-700">{settings?.product_name || 'Product'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="btn-export-ledger-csv"
            onClick={() => exportItemLedgerCsv(entries, settings)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-xs transition-colors"
            title="Export stock movements audit ledger to CSV"
          >
            <Download className="w-4 h-4 text-slate-700" />
            <span>Export Ledger CSV</span>
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

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Stock In</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-blue-700 font-mono">
                  {summary.totalStockIn.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">{unit}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Stock Out</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-emerald-700 font-mono">
                  {summary.totalStockOut.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">{unit}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Running Stock Balance</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 font-mono">
                  {summary.currentStock.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">{unit}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 bg-white"
            >
              <option value="ALL">All Movements</option>
              <option value="PURCHASE">Purchases (Stock In)</option>
              <option value="SALE">Sales (Stock Out)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Batch:</span>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 bg-white font-mono"
            >
              <option value="ALL">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_number}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
            />
          </div>
        </div>

        {(startDate || endDate || typeFilter !== 'ALL' || batchFilter !== 'ALL') && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setTypeFilter('ALL');
              setBatchFilter('ALL');
            }}
            className="text-blue-600 hover:underline font-medium text-xs"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Item Ledger Table specified in prompt */}
      {/* Table: Date | Type | Reference | Batch | Stock In | Stock Out | Running Balance */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Reference</th>
                <th className="px-4 py-3.5">Batch</th>
                <th className="px-4 py-3.5 text-right">Stock In (+)</th>
                <th className="px-4 py-3.5 text-right">Stock Out (-)</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-blue-300">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No stock movement entries recorded yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isPurchase = entry.transaction_type === 'PURCHASE';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-600">{entry.date}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isPurchase
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {entry.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{entry.reference}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {entry.batch_number ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                            {entry.batch_number}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                        {entry.stock_in > 0 ? `+${entry.stock_in} ${unit}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        {entry.stock_out > 0 ? `-${entry.stock_out} ${unit}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {entry.running_balance.toLocaleString()} {unit}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
