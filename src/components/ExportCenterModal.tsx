import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  ShoppingCart,
  PackagePlus,
  Users,
  Wallet,
  Boxes,
  BookOpen,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import { api } from '../api';
import { Settings, Customer, Sale, StockBatch, Collection } from '../types';
import {
  exportSalesCsv,
  exportPurchasesCsv,
  exportBatchesCsv,
  exportCustomersSummaryCsv,
  exportAllCustomerSalesCsv,
  exportCollectionsCsv,
  exportStockBalanceCsv,
  exportItemLedgerCsv,
  exportProfitReportCsv,
} from '../utils/csvExport';

interface ExportCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
}

export const ExportCenterModal: React.FC<ExportCenterModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    sales: number;
    purchases: number;
    batches: number;
    customers: number;
    collections: number;
  }>({
    sales: 0,
    purchases: 0,
    batches: 0,
    customers: 0,
    collections: 0,
  });

  useEffect(() => {
    if (!isOpen) return;

    // Load initial counts for preview badges
    const loadCounts = async () => {
      try {
        const [sales, batchesRes, customers, collections] = await Promise.all([
          api.getSales().catch(() => []),
          api.getBatches().catch(() => ({ batches: [] })),
          api.getCustomers().catch(() => []),
          api.getCollections().catch(() => []),
        ]);
        setCounts({
          sales: sales.length,
          purchases: batchesRes.batches.length,
          batches: batchesRes.batches.length,
          customers: customers.length,
          collections: collections.length,
        });
      } catch (err) {
        console.error('Failed to load export counts:', err);
      }
    };

    loadCounts();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExportSales = async () => {
    setIsExporting('sales');
    try {
      const sales = await api.getSales();
      exportSalesCsv(sales, settings);
      setSuccessNotice(`Exported ${sales.length} sales records with complete fulfillment & payment details!`);
    } catch (err: any) {
      alert('Failed to export sales: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPurchases = async () => {
    setIsExporting('purchases');
    try {
      const res = await api.getBatches();
      exportPurchasesCsv(res.batches, settings);
      setSuccessNotice(`Exported ${res.batches.length} purchase batches with unit costs and stock status!`);
    } catch (err: any) {
      alert('Failed to export purchases: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportCustomersSummary = async () => {
    setIsExporting('customers');
    try {
      const customers = await api.getCustomers();
      exportCustomersSummaryCsv(customers, settings);
      setSuccessNotice(`Exported ${customers.length} customer profiles with balances and pending delivery units!`);
    } catch (err: any) {
      alert('Failed to export customers: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportAllCustomerSales = async () => {
    setIsExporting('customer-sales');
    try {
      const [sales, customers] = await Promise.all([api.getSales(), api.getCustomers()]);
      exportAllCustomerSalesCsv(sales, customers, settings);
      setSuccessNotice(`Exported ${sales.length} customer sales transactions with full unit rates and fulfillment!`);
    } catch (err: any) {
      alert('Failed to export customer sales: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportBatches = async () => {
    setIsExporting('batches');
    try {
      const res = await api.getBatches();
      exportBatchesCsv(res.batches, settings);
      setSuccessNotice(`Exported ${res.batches.length} stock batches with FIFO remaining values!`);
    } catch (err: any) {
      alert('Failed to export batches: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportCollections = async () => {
    setIsExporting('collections');
    try {
      const collections = await api.getCollections();
      exportCollectionsCsv(collections, settings);
      setSuccessNotice(`Exported ${collections.length} collection receipts with payment methods!`);
    } catch (err: any) {
      alert('Failed to export collections: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportStockBalance = async () => {
    setIsExporting('stock-balance');
    try {
      const report = await api.getStockBalanceReport();
      exportStockBalanceCsv(report, settings);
      setSuccessNotice('Exported stock balance and inventory valuation report!');
    } catch (err: any) {
      alert('Failed to export stock report: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportItemLedger = async () => {
    setIsExporting('item-ledger');
    try {
      const res = await api.getItemLedger();
      exportItemLedgerCsv(res.entries, settings);
      setSuccessNotice(`Exported ${res.entries.length} stock movement ledger entries!`);
    } catch (err: any) {
      alert('Failed to export item ledger: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportProfit = async () => {
    setIsExporting('profit');
    try {
      const report = await api.getProfitReport();
      exportProfitReportCsv(report, settings);
      setSuccessNotice('Exported profit and margin report with batch allocation!');
    } catch (err: any) {
      alert('Failed to export profit report: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportAllEverything = async () => {
    setIsExporting('all');
    try {
      const [sales, batchesRes, customers, collections, stockReport, itemLedgerRes, profitReport] =
        await Promise.all([
          api.getSales(),
          api.getBatches(),
          api.getCustomers(),
          api.getCollections(),
          api.getStockBalanceReport(),
          api.getItemLedger(),
          api.getProfitReport(),
        ]);

      // Download each dataset cleanly with small delays to allow browser to register downloads
      exportSalesCsv(sales, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportPurchasesCsv(batchesRes.batches, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportCustomersSummaryCsv(customers, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportAllCustomerSalesCsv(sales, customers, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportCollectionsCsv(collections, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportBatchesCsv(batchesRes.batches, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportStockBalanceCsv(stockReport, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportItemLedgerCsv(itemLedgerRes.entries, settings);
      await new Promise((r) => setTimeout(r, 200));
      exportProfitReportCsv(profitReport, settings);

      setSuccessNotice('All core business reports exported successfully in CSV format!');
    } catch (err: any) {
      alert('Failed to complete batch export: ' + (err.message || err));
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-6">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Data Export Center (CSV)</h2>
              <p className="text-xs text-slate-400">
                Download sales, purchases, customer purchases/sellings, and stock audits into universal CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Banner */}
        {successNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
            <button
              onClick={() => setSuccessNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 font-semibold text-[11px] underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Universal All-In-One Action */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-700 text-white uppercase tracking-wider">
                  Universal Export
                </span>
                <h3 className="text-sm font-bold text-slate-900">Download All Datasets (Master CSV Bundle)</h3>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Generates separate CSV files for Sales, Purchases, Customers, Transactions, Collections, and Inventory in one click.
              </p>
            </div>
            <button
              id="btn-export-all-master"
              onClick={handleExportAllEverything}
              disabled={isExporting !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {isExporting === 'all' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isExporting === 'all' ? 'Exporting All...' : 'Export All CSVs'}</span>
            </button>
          </div>

          {/* Individual Export Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. SALES DETAILED */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Sales & Fulfillment Orders</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    {counts.sales} records
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Every sales order: Customer, order units, selling price, paid amount, balance due, delivered vs pending units, and FIFO cost.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-sales-csv"
                  onClick={handleExportSales}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                >
                  {isExporting === 'sales' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Sales (.csv)</span>
                </button>
              </div>
            </div>

            {/* 2. PURCHASES / BATCHES */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <PackagePlus className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Purchases & Stock Batches</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    {counts.batches} batches
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Inward purchase batches: Batch #, date, purchase price, total cost, remaining stock, sold quantity, and notes.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-purchases-csv"
                  onClick={handleExportPurchases}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 disabled:opacity-50"
                >
                  {isExporting === 'purchases' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Purchases (.csv)</span>
                </button>
              </div>
            </div>

            {/* 3. TOTAL CUSTOMERS SUMMARY & BALANCES */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Total Customers Purchases & Balances</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    {counts.customers} customers
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  High-level summary per customer: Invoiced sales, collections, outstanding balance to pay, and total pending units awaiting delivery.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-cust-summary-csv"
                  onClick={handleExportCustomersSummary}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 disabled:opacity-50"
                >
                  {isExporting === 'customers' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Customers Summary (.csv)</span>
                </button>
              </div>
            </div>

            {/* 4. ALL CUSTOMER TRANSACTIONS DETAILED */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">All Customer Purchases & Sellings (Detailed)</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    Itemized Lines
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Detailed line-by-line transactions across all customers with rate, amount, payment balance, and dispatch fulfillment status.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-cust-detailed-csv"
                  onClick={handleExportAllCustomerSales}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200 disabled:opacity-50"
                >
                  {isExporting === 'customer-sales' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export All Customer Sellings (.csv)</span>
                </button>
              </div>
            </div>

            {/* 5. DAILY COLLECTIONS */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Daily Customer Collections</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    {counts.collections} receipts
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Cash receipts and payment vouchers: Customer name, receipt date, payment method (Cash, Bank, Check), and notes.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-collections-csv"
                  onClick={handleExportCollections}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors border border-teal-200 disabled:opacity-50"
                >
                  {isExporting === 'collections' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Collections (.csv)</span>
                </button>
              </div>
            </div>

            {/* 6. STOCK BALANCE & VALUATION */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Stock Balance & Batch Valuation</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                    FIFO Audit
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Batch-wise inventory valuation: Original units, units sold, units remaining on hand, and current asset value.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-stock-csv"
                  onClick={handleExportStockBalance}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 disabled:opacity-50"
                >
                  {isExporting === 'stock-balance' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Stock Balance (.csv)</span>
                </button>
              </div>
            </div>

            {/* 7. ITEM LEDGER AUDIT TRAIL */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Item Ledger (Stock Movements)</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    Audit Trail
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Complete chronological ledger showing every Stock In (Purchases) and Stock Out (Sales) with running inventory balance.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-ledger-csv"
                  onClick={handleExportItemLedger}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-750 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300 disabled:opacity-50"
                >
                  {isExporting === 'item-ledger' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Item Ledger (.csv)</span>
                </button>
              </div>
            </div>

            {/* 8. PROFIT & LOSS REPORT */}
            <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Profit & Margins Analytics</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                    Gross Margins
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Profit breakdown per sale: Revenue, FIFO cost of goods, net gross profit, profit percentage, and allocated batches.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  id="btn-export-profit-csv"
                  onClick={handleExportProfit}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 disabled:opacity-50"
                >
                  {isExporting === 'profit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Export Profit Report (.csv)</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Files are encoded in standard UTF-8 CSV with Excel BOM compatibility.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
