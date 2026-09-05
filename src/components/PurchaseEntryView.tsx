import React, { useState, useEffect } from 'react';
import { PackagePlus, CheckCircle2, AlertCircle, Info, Boxes, ArrowRight, TrendingUp, Tag, DollarSign, Download, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Settings, StockBatch } from '../types';
import { exportPurchasesCsv } from '../utils/csvExport';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface PurchaseEntryViewProps {
  settings: Settings;
  onPurchaseSuccess: () => void;
  onNavigateToBatches: () => void;
}

export const PurchaseEntryView: React.FC<PurchaseEntryViewProps> = ({
  settings,
  onPurchaseSuccess,
  onNavigateToBatches,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState<string>(today);
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [nextSuggestedBatch, setNextSuggestedBatch] = useState<string>('');
  const [recentBatches, setRecentBatches] = useState<StockBatch[]>([]);
  const [batchToDelete, setBatchToDelete] = useState<StockBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    averagePurchaseCost: number;
    allTimeAveragePurchaseCost: number;
    averageSellingPrice: number;
    totalRemaining: number;
  } | null>(null);

  // Calculate live total purchase amount
  const numQty = parseFloat(quantity) || 0;
  const numPrice = parseFloat(purchasePrice) || 0;
  const calculatedTotal = Math.round(numQty * numPrice * 100) / 100;

  const loadBatchInfo = async () => {
    try {
      const res = await api.getBatches();
      setNextSuggestedBatch(res.nextBatchNumber);
      if (!batchNumber) {
        setBatchNumber(res.nextBatchNumber);
      }
      setRecentBatches(res.batches.slice(0, 5));
      if (res.summary) {
        setBatchSummary({
          averagePurchaseCost: res.summary.averagePurchaseCost || 0,
          allTimeAveragePurchaseCost: res.summary.allTimeAveragePurchaseCost || 0,
          averageSellingPrice: res.summary.averageSellingPrice || 0,
          totalRemaining: res.summary.totalRemaining || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load batch info:', err);
    }
  };

  useEffect(() => {
    loadBatchInfo();
  }, []);

  const handleExportPurchases = async () => {
    try {
      const purchases = await api.getPurchases();
      exportPurchasesCsv(purchases && purchases.length > 0 ? purchases : recentBatches, settings);
    } catch {
      exportPurchasesCsv(recentBatches, settings);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!date) {
      setStatusMessage({ type: 'error', text: 'Please select a purchase date.' });
      return;
    }
    if (numQty <= 0) {
      setStatusMessage({ type: 'error', text: 'Quantity must be greater than 0.' });
      return;
    }
    if (numPrice < 0) {
      setStatusMessage({ type: 'error', text: 'Purchase price must be positive.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.createPurchase({
        date,
        batch_number: batchNumber.trim() || undefined,
        quantity: numQty,
        unit_purchase_price: numPrice,
        notes: notes.trim(),
      });

      setStatusMessage({
        type: 'success',
        text: result.message || 'Purchase saved and batch created successfully!',
      });

      // Clear form and prepare next batch
      setQuantity('');
      setPurchasePrice('');
      setNotes('');
      await loadBatchInfo();
      onPurchaseSuccess();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to save purchase. Check if batch number is unique.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeletingBatch(true);
    setStatusMessage(null);
    try {
      const res = await api.deleteBatch(batchToDelete.id);
      setStatusMessage({
        type: 'success',
        text: res.message || `Batch ${batchToDelete.batch_number} deleted successfully.`,
      });
      setBatchToDelete(null);
      await loadBatchInfo();
      onPurchaseSuccess();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to delete batch.',
      });
      setBatchToDelete(null);
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const avgPurchase = batchSummary?.averagePurchaseCost || 0;
  const avgSelling = batchSummary?.averageSellingPrice || 0;
  const priceDiffVsAvg = numPrice > 0 && avgPurchase > 0 ? numPrice - avgPurchase : 0;
  const projectedMargin = numPrice > 0 && avgSelling > 0 ? avgSelling - numPrice : 0;
  const projectedMarginPct = numPrice > 0 && avgSelling > 0 ? ((projectedMargin / avgSelling) * 100) : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Purchase & Stock Batch Entry</h2>
          <p className="text-sm text-slate-500">
            Create an isolated stock batch for <span className="font-semibold text-slate-700">{settings?.product_name || 'Product'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            id="btn-export-purchases-header"
            onClick={handleExportPurchases}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-2 rounded-lg border border-slate-300 shadow-xs transition-colors"
            title="Export inward purchases and stock batches to CSV"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export Purchases CSV</span>
          </button>
          <button
            id="btn-nav-batch-inv"
            onClick={onNavigateToBatches}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border border-blue-200 transition-colors"
          >
            <Boxes className="w-4 h-4" />
            <span>View All Batches ({recentBatches.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-blue-950">Automated Multi-Record Update Rule:</p>
          <p className="text-blue-800 mt-0.5">
            Saving this purchase automatically: <strong>(1)</strong> creates a new independent stock batch, <strong>(2)</strong> increases total available inventory, <strong>(3)</strong> writes a Stock-In record to the Item Ledger, and <strong>(4)</strong> updates the weighted average purchase cost.
          </p>
        </div>
      </div>

      {/* Pricing & Stock Benchmark KPIs */}
      {batchSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Purchase Price</span>
              <Tag className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {avgPurchase.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500">/{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Weighted cost of current stock
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Selling Price</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-slate-500">{cur}</span>
              <span className="text-xl font-bold text-emerald-700 font-mono">
                {avgSelling > 0 ? avgSelling.toFixed(2) : '—'}
              </span>
              {avgSelling > 0 && <span className="text-xs text-slate-500">/{unit}</span>}
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Realized customer selling rate
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider">Gross Spread / Margin</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-xs text-emerald-700 font-bold">{cur}</span>
              <span className="text-xl font-bold text-emerald-800 font-mono">
                {avgSelling > 0 && avgPurchase > 0 ? (avgSelling - avgPurchase).toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-emerald-700 font-medium">/{unit}</span>
            </div>
            <span className="text-[10px] text-emerald-700 block mt-0.5">
              {avgSelling > 0 && avgPurchase > 0 ? `${(((avgSelling - avgPurchase) / avgSelling) * 100).toFixed(1)}% gross margin benchmark` : 'Awaiting sales data'}
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Available Stock</span>
              <Boxes className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-slate-900 font-mono">
                {batchSummary.totalRemaining.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              In active inventory
            </span>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-4 rounded-lg text-xs flex items-center gap-2.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Entry Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Purchase Date */}
            <div>
              <label htmlFor="purchase-date" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Purchase Date *
              </label>
              <input
                type="date"
                id="purchase-date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Batch Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="purchase-batch-number" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Batch Number *
                </label>
                {nextSuggestedBatch && (
                  <span className="text-[10px] text-slate-500">
                    Suggested: <span className="font-mono font-semibold text-blue-600">{nextSuggestedBatch}</span>
                  </span>
                )}
              </div>
              <input
                type="text"
                id="purchase-batch-number"
                required
                placeholder="e.g. BATCH-003"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Quantity */}
            <div>
              <label htmlFor="purchase-quantity" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Quantity ({unit}) *
              </label>
              <input
                type="number"
                id="purchase-quantity"
                required
                min="0.01"
                step="any"
                placeholder="e.g. 75"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Purchase Price Per Unit */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="purchase-unit-price" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Purchase Price Per {unit} ({cur}) *
                </label>
                {avgPurchase > 0 && (
                  <span className="text-[10px] text-slate-500">
                    Avg Cost: <strong className="font-mono text-slate-700">{cur}{avgPurchase.toFixed(2)}</strong>
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{cur}</span>
                <input
                  type="number"
                  id="purchase-unit-price"
                  required
                  min="0"
                  step="0.01"
                  placeholder="e.g. 26.50"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Live Contextual Price Insight */}
              {numPrice > 0 && (
                <div className="mt-1.5 space-y-1">
                  {avgPurchase > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {priceDiffVsAvg < 0 ? (
                        <span className="text-emerald-700 font-medium">
                          ✓ {cur}{Math.abs(priceDiffVsAvg).toFixed(2)} below current avg cost ({Math.abs((priceDiffVsAvg / avgPurchase) * 100).toFixed(1)}% savings)
                        </span>
                      ) : priceDiffVsAvg > 0 ? (
                        <span className="text-amber-700 font-medium">
                          ⚠ {cur}{priceDiffVsAvg.toFixed(2)} above current avg cost (+{((priceDiffVsAvg / avgPurchase) * 100).toFixed(1)}%)
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium">
                          Equals current weighted avg cost
                        </span>
                      )}
                    </div>
                  )}
                  {avgSelling > 0 && (
                    <div className="text-[11px] text-slate-500">
                      Margin at avg selling price ({cur}{avgSelling.toFixed(2)}):{' '}
                      <strong className={projectedMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                        {projectedMargin >= 0 ? '+' : ''}{cur}{projectedMargin.toFixed(2)} ({projectedMarginPct.toFixed(1)}%)
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Total Purchase Amount (Auto-calculated) */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Total Purchase Amount (Auto)
              </label>
              <div className="w-full px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-sm font-bold text-slate-900 font-mono flex items-center justify-between">
                <span>{cur}{calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Qty × Price</span>
              </div>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="purchase-notes" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Purchase Notes / Supplier Information
              </label>
              <input
                type="text"
                id="purchase-notes"
                placeholder="e.g. Origin Imports Lot #9204, container delivery"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setQuantity('');
                setPurchasePrice('');
                setNotes('');
                setStatusMessage(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              id="btn-save-purchase"
              disabled={isSubmitting || numQty <= 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <PackagePlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Batch...' : 'Save Purchase & Create Batch'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Recent Batches List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active & Recent Batches</h3>
            <p className="text-[11px] text-slate-500">Each batch maintains independent unit cost</p>
          </div>
          <button
            id="btn-export-batches-table"
            onClick={handleExportPurchases}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export Batches (.csv)</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Batch Number</th>
                <th className="px-4 py-2.5">Purchase Date</th>
                <th className="px-4 py-2.5 text-right">Original Qty</th>
                <th className="px-4 py-2.5 text-right">Remaining Qty</th>
                <th className="px-4 py-2.5 text-right">Unit Purchase Price</th>
                <th className="px-4 py-2.5 text-right">Avg Selling Price</th>
                <th className="px-4 py-2.5 text-right">Realized Profit</th>
                <th className="px-4 py-2.5 text-right">Remaining Value</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentBatches.map((b) => {
                const bSellingPrice = b.average_selling_price || avgSelling;
                const bProfit = b.realized_profit || 0;
                return (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold font-mono text-slate-900">{b.batch_number}</td>
                    <td className="px-4 py-3 text-slate-600">{b.purchase_date}</td>
                    <td className="px-4 py-3 text-right font-mono">{b.original_quantity}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{b.remaining_quantity}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 font-semibold">{cur}{b.unit_cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">
                      {bSellingPrice > 0 ? (
                        <span>
                          {cur}{bSellingPrice.toFixed(2)}
                          {b.has_realized_sales && <span className="ml-1 text-[10px] text-slate-400 font-sans">(actual)</span>}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {b.sold_quantity > 0 ? (
                        <span className={bProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {bProfit >= 0 ? '+' : ''}{cur}{bProfit.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400">0 sold</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900 font-semibold">{cur}{b.remaining_value.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          b.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setBatchToDelete(b)}
                        className="p-1 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors inline-flex items-center gap-1 text-[11px] font-semibold"
                        title="Delete Batch & Purchase"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
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
