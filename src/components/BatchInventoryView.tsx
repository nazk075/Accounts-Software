import React, { useState, useEffect } from 'react';
import { Boxes, Search, Filter, RefreshCw, PackagePlus, ArrowUpDown, TrendingUp, DollarSign, Tag, Download, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { StockBatch, Settings } from '../types';
import { exportBatchesCsv } from '../utils/csvExport';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface BatchInventoryViewProps {
  settings: Settings;
  onNavigateToPurchase: () => void;
}

export const BatchInventoryView: React.FC<BatchInventoryViewProps> = ({
  settings,
  onNavigateToPurchase,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXHAUSTED'>('ALL');
  const [batchToDelete, setBatchToDelete] = useState<StockBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const res = await api.getBatches();
      setBatches(res.batches);
      setSummary(res.summary);
    } catch (err) {
      console.error('Failed to load batch inventory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const filteredBatches = batches.filter((b) => {
    const matchesSearch = b.batch_number.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'ACTIVE') return b.remaining_quantity > 0;
    if (statusFilter === 'EXHAUSTED') return b.remaining_quantity <= 0;
    return true;
  });

  const handleConfirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeletingBatch(true);
    setFeedbackMsg(null);
    try {
      const res = await api.deleteBatch(batchToDelete.id);
      setFeedbackMsg({
        type: 'success',
        text: res.message || `Batch ${batchToDelete.batch_number} deleted successfully.`,
      });
      setBatchToDelete(null);
      await loadBatches();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to delete batch.',
      });
      setBatchToDelete(null);
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const avgPurchaseCost = summary?.averagePurchaseCost || 0;
  const avgSellingPrice = summary?.averageSellingPrice || 0;
  const marginSpread = avgSellingPrice > 0 && avgPurchaseCost > 0 ? avgSellingPrice - avgPurchaseCost : 0;
  const marginSpreadPct = avgSellingPrice > 0 ? ((marginSpread / avgSellingPrice) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Batch Inventory</h2>
          <p className="text-sm text-slate-500">
            Isolated batch-level stock accounting for <span className="font-semibold text-slate-700">{settings?.product_name || 'Product'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-export-batches-csv"
            onClick={() => exportBatchesCsv(filteredBatches.length > 0 ? filteredBatches : batches, settings)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-xs transition-colors"
            title="Export stock batches and valuation to CSV"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Export Batches CSV</span>
          </button>
          <button
            onClick={loadBatches}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="btn-new-batch-from-inv"
            onClick={onNavigateToPurchase}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <PackagePlus className="w-4 h-4" />
            <span>New Purchase Batch</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
            <span className="text-[11px] font-medium text-emerald-800 uppercase tracking-wider block">Remaining Stock</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-emerald-800 font-mono">{summary.totalRemaining.toLocaleString()}</span>
              <span className="text-xs text-emerald-700 font-medium">{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">{summary.activeBatches} active batches</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Stock Value</span>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {summary.totalRemainingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">At batch unit costs</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Avg Purchase Price</span>
              <Tag className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-blue-700 font-mono">
                {avgPurchaseCost.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-500">/{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Weighted cost of stock</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Avg Selling Price</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-emerald-700 font-mono">
                {avgSellingPrice > 0 ? avgSellingPrice.toFixed(2) : '—'}
              </span>
              {avgSellingPrice > 0 && <span className="text-[11px] text-slate-500">/{unit}</span>}
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Realized across all sales</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Gross Unit Margin</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {marginSpread > 0 ? marginSpread.toFixed(2) : '0.00'}
              </span>
              <span className="text-[11px] text-slate-500">/{unit}</span>
            </div>
            <span className="text-[10px] text-emerald-700 block mt-0.5">
              {marginSpreadPct > 0 ? `+${marginSpreadPct.toFixed(1)}% benchmark spread` : 'Based on historical sales'}
            </span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            id="batch-search-input"
            placeholder="Search batch number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          <span className="text-slate-500 mr-1">Status:</span>
          {(['ALL', 'ACTIVE', 'EXHAUSTED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'ALL' ? 'All Batches' : status === 'ACTIVE' ? 'Active Stock' : 'Exhausted'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table specified in prompt */}
      {/* Table: Batch Number | Date | Purchased Qty | Sold Qty | Remaining Qty | Purchase Price | Selling Price | Realized Profit | Remaining Value | Status */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Batch Number</th>
                <th className="px-4 py-3.5">Purchase Date</th>
                <th className="px-4 py-3.5 text-right">Purchased Qty</th>
                <th className="px-4 py-3.5 text-right">Sold Qty</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-blue-300">Remaining Qty</th>
                <th className="px-4 py-3.5 text-right">Purchase Price / Unit</th>
                <th className="px-4 py-3.5 text-right">Selling Price / Unit</th>
                <th className="px-4 py-3.5 text-right bg-slate-800 text-emerald-300">Realized Profit</th>
                <th className="px-4 py-3.5 text-right">Remaining Value</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    No batches match your filter.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const isActive = batch.remaining_quantity > 0;
                  const bSellingPrice = batch.average_selling_price || avgSellingPrice;
                  const bProfit = batch.realized_profit || 0;

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold font-mono text-slate-900">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-mono">
                          {batch.batch_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{batch.purchase_date}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {batch.original_quantity.toLocaleString()} {unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {batch.sold_quantity.toLocaleString()} {unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>
                          {batch.remaining_quantity.toLocaleString()} {unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-800 font-semibold">
                        {cur}{batch.unit_cost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                        {bSellingPrice > 0 ? (
                          <span>
                            {cur}{bSellingPrice.toFixed(2)}
                            {batch.has_realized_sales && (
                              <span className="ml-1 text-[10px] text-slate-400 font-normal font-sans">(actual)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        {batch.sold_quantity > 0 ? (
                          <span className={bProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {bProfit >= 0 ? '+' : ''}{cur}{bProfit.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">0 sold</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {cur}{batch.remaining_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setBatchToDelete(batch)}
                          className="p-1 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors inline-flex items-center gap-1 text-[11px] font-semibold"
                          title="Delete Batch"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Batch Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(batchToDelete)}
        title={`Delete Batch ${batchToDelete?.batch_number}`}
        message={`Are you sure you want to delete Batch ${batchToDelete?.batch_number} (${batchToDelete?.original_quantity} ${unit} purchased on ${batchToDelete?.purchase_date} at ${cur}${batchToDelete?.unit_cost.toFixed(2)})?`}
        warningNotice="Note: Batches that have already been partially or fully sold cannot be deleted unless the associated sales are removed first."
        confirmText="Delete Batch"
        isDeleting={isDeletingBatch}
        onConfirm={handleConfirmDeleteBatch}
        onClose={() => setBatchToDelete(null)}
      />
    </div>
  );
};
