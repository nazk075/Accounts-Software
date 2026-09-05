import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Wallet,
  ShoppingCart,
  Phone,
  MapPin,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertCircle,
  Truck,
  CreditCard,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  Clock,
  FileText,
  Info,
  X,
  Package,
  Download,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import { Customer, CustomerLedgerEntry, Sale, SaleDelivery, Settings } from '../types';
import { exportCustomerStatementCsv } from '../utils/csvExport';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface CustomerAccountViewProps {
  customerId: number;
  settings: Settings;
  onBack: () => void;
  onRecordSaleForCustomer: (customerId: number) => void;
}

interface CustomerSummary {
  totalSales: number;
  totalCollections: number;
  outstandingBalance: number;
  totalDeliveredValue?: number;
  totalPendingValue?: number;
  totalOrderedUnits?: number;
  totalDeliveredUnits?: number;
  totalPendingUnits?: number;
}

export const CustomerAccountView: React.FC<CustomerAccountViewProps> = ({
  customerId,
  settings,
  onBack,
  onRecordSaleForCustomer,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const today = new Date().toISOString().split('T')[0];

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'ledger' | 'deliveries'>('orders');
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'SALE' | 'DELIVERY' | 'COLLECTION'>('ALL');

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Payment Modal (for General Account or Specific Sale)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTargetSale, setPayTargetSale] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [payModalError, setPayModalError] = useState('');

  // Delivery Modal (for a specific sale)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryTargetSale, setDeliveryTargetSale] = useState<Sale | null>(null);
  const [deliverQty, setDeliverQty] = useState('');
  const [deliverDate, setDeliverDate] = useState(today);
  const [deliverNotes, setDeliverNotes] = useState('');
  const [isDelivering, setIsDelivering] = useState(false);
  const [deliveryModalError, setDeliveryModalError] = useState('');

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete State
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [isDeletingSale, setIsDeletingSale] = useState(false);
  const [deliveryToDelete, setDeliveryToDelete] = useState<{ id: number; quantity: number; date: string; saleId?: number } | null>(null);
  const [isDeletingDelivery, setIsDeletingDelivery] = useState(false);
  const [showDeleteCustomerModal, setShowDeleteCustomerModal] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const loadAccount = async () => {
    setIsLoading(true);
    try {
      const res = await api.getCustomerLedger(customerId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setCustomer(res.customer);
      setSummary(res.summary);
      setLedger(res.ledger || []);
      setSales(res.sales || []);
    } catch (err: any) {
      console.error('Failed to load customer account:', err);
      setMsg({ type: 'error', text: err.message || 'Failed to load customer account' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, [customerId, startDate, endDate]);

  // Delete Handlers
  const handleConfirmDeleteSale = async () => {
    if (!saleToDelete) return;
    setIsDeletingSale(true);
    try {
      const res = await api.deleteSale(saleToDelete.id);
      setMsg({
        type: 'success',
        text: res.message || `Sale #${saleToDelete.id} deleted successfully. Inventory and customer balance restored.`,
      });
      setSaleToDelete(null);
      await loadAccount();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete sale.' });
    } finally {
      setIsDeletingSale(false);
    }
  };

  const handleConfirmDeleteDelivery = async () => {
    if (!deliveryToDelete) return;
    setIsDeletingDelivery(true);
    try {
      const res = await api.deleteDelivery(deliveryToDelete.id);
      setMsg({
        type: 'success',
        text: res.message || `Delivery record deleted successfully. Pending delivery quantity restored.`,
      });
      setDeliveryToDelete(null);
      await loadAccount();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete delivery record.' });
    } finally {
      setIsDeletingDelivery(false);
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    setIsDeletingCustomer(true);
    try {
      await api.deleteCustomer(customerId);
      setShowDeleteCustomerModal(false);
      onBack();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete customer. Make sure all sales and payments are removed first.' });
      setShowDeleteCustomerModal(false);
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const handleOpenPaymentModal = (targetSale?: Sale) => {
    setPayModalError('');
    if (targetSale) {
      setPayTargetSale(targetSale);
      const due = targetSale.balance_due !== undefined ? targetSale.balance_due : Math.max(0, targetSale.total_sales - (targetSale.amount_paid || 0));
      setPayAmount(String(due > 0 ? due : ''));
      setPayNotes(`Payment for Sale #${targetSale.id}`);
    } else {
      setPayTargetSale(null);
      const balance = summary ? summary.outstandingBalance : 0;
      setPayAmount(balance > 0 ? String(balance) : '');
      setPayNotes('Account settlement payment');
    }
    setPayDate(today);
    setPayMethod('Cash');
    setShowPayModal(true);
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayModalError('');
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayModalError('Please enter a valid payment amount greater than 0.');
      return;
    }

    setIsPaying(true);
    try {
      if (payTargetSale) {
        // Specific Sale Payment
        await api.recordSalePayment(payTargetSale.id, {
          amount: amt,
          date: payDate,
          payment_method: payMethod,
          notes: payNotes.trim() || undefined,
        });
        setMsg({
          type: 'success',
          text: `Payment of ${cur}${amt.toFixed(2)} recorded for Sale #${payTargetSale.id} and credited to account!`,
        });
      } else {
        // General Account Collection (automatically auto-allocates to oldest open sales via FIFO)
        await api.createCollections([
          {
            customer_id: customerId,
            date: payDate,
            amount: amt,
            payment_method: payMethod,
            notes: payNotes.trim() || 'Account collection',
          },
        ]);
        setMsg({
          type: 'success',
          text: `Collection of ${cur}${amt.toFixed(2)} credited to account and allocated to unpaid sales!`,
        });
      }

      setShowPayModal(false);
      setPayTargetSale(null);
      await loadAccount();
    } catch (err: any) {
      setPayModalError(err.message || 'Failed to record payment');
    } finally {
      setIsPaying(false);
    }
  };

  // Open Delivery Dispatch Modal
  const handleOpenDeliveryModal = (sale: Sale) => {
    setDeliveryModalError('');
    setDeliveryTargetSale(sale);
    const pending = sale.pending_quantity !== undefined ? sale.pending_quantity : Math.max(0, sale.quantity - (sale.delivered_quantity || 0));
    setDeliverQty(String(pending > 0 ? pending : sale.quantity));
    setDeliverDate(today);
    setDeliverNotes(`Dispatched ${pending} ${unit} to ${sale.customer_name || 'customer'}`);
    setShowDeliveryModal(true);
  };

  // Submit Delivery Dispatch
  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryTargetSale) return;
    setDeliveryModalError('');

    const qty = parseFloat(deliverQty);
    if (isNaN(qty) || qty <= 0) {
      setDeliveryModalError(`Please enter a valid dispatch quantity in ${unit}.`);
      return;
    }

    setIsDelivering(true);
    try {
      await api.recordSaleDelivery(deliveryTargetSale.id, {
        quantity: qty,
        date: deliverDate,
        notes: deliverNotes.trim() || undefined,
      });

      setMsg({
        type: 'success',
        text: `Successfully dispatched and delivered ${qty} ${unit} for Sale #${deliveryTargetSale.id}!`,
      });

      setShowDeliveryModal(false);
      setDeliveryTargetSale(null);
      await loadAccount();
    } catch (err: any) {
      setDeliveryModalError(err.message || 'Failed to record delivery dispatch');
    } finally {
      setIsDelivering(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportStatement = () => {
    if (!customer) return;
    exportCustomerStatementCsv(customer, ledger, settings);
  };

  // Flatten all deliveries across all sales for the Deliveries tab
  const allDeliveries: (SaleDelivery & { sale_id: number; sale_date?: string })[] = [];
  sales.forEach((s) => {
    if (s.deliveries && s.deliveries.length > 0) {
      s.deliveries.forEach((d) => {
        allDeliveries.push({
          ...d,
          sale_id: s.id,
          sale_date: s.date,
        });
      });
    }
  });

  if (!customer && isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
        <span>Loading customer account and delivery history...</span>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-slate-600">Customer not found.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 text-xs bg-slate-100 rounded-lg hover:bg-slate-200">
          Back to Customers
        </button>
      </div>
    );
  }

  const orderedUnits = summary?.totalOrderedUnits ?? 0;
  const deliveredUnits = summary?.totalDeliveredUnits ?? (customer.total_delivered_quantity || 0);
  const pendingUnits = summary?.totalPendingUnits ?? (customer.total_pending_quantity || 0);
  const deliveredValue = summary?.totalDeliveredValue ?? (customer.total_delivered_value || 0);
  const pendingValue = summary?.totalPendingValue ?? (customer.total_pending_value || 0);
  const deliveryPct = orderedUnits > 0 ? Math.min(100, Math.round((deliveredUnits / orderedUnits) * 100)) : 100;

  return (
    <div className="space-y-6">
      {/* Back button & Customer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
            title="Back to Customer List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                Customer #{customer.id}
              </span>
              {pendingUnits > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{pendingUnits} {unit} Pending Dispatch</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
              {customer.phone && (
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {customer.phone}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {customer.address}
                </span>
              )}
              <span>•</span>
              <span>Client Account & Fulfillment Statement</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            id="btn-export-statement-csv"
            onClick={handleExportStatement}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            title="Export full account statement including sales, ledger, and deliveries into CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export Statement (.csv)</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Statement</span>
          </button>

          <button
            onClick={() => handleOpenPaymentModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
            title="Record customer payment or collection"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => onRecordSaleForCustomer(customer.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>New Sale</span>
          </button>

          <button
            onClick={() => setShowDeleteCustomerModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
            title="Delete this customer account"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between border ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact Corner / Top Metrics Summary Bar */}
      {summary && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          {/* Total Invoiced Orders */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-800 rounded-lg text-xs border border-slate-200">
            <span className="text-slate-500 font-medium">Invoiced:</span>
            <span className="font-bold font-mono text-slate-900">
              {cur}{summary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-medium">({orderedUnits} {unit})</span>
          </div>

          {/* Delivered to Client */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-900 rounded-lg text-xs border border-blue-200">
            <span className="text-blue-700 font-medium">Delivered:</span>
            <span className="font-bold font-mono text-blue-950">
              {deliveredUnits} {unit}
            </span>
            <span className="text-[10px] bg-blue-200/80 text-blue-900 font-bold px-1 rounded">
              {deliveryPct}%
            </span>
          </div>

          {/* Pending Delivery */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            pendingUnits > 0
              ? 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
              : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            <span className={pendingUnits > 0 ? 'text-amber-800 font-medium' : 'text-slate-500 font-medium'}>
              To Deliver:
            </span>
            <span className="font-bold font-mono">
              {pendingUnits} {unit}
            </span>
            {pendingUnits > 0 && (
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-mono">
                {cur}{pendingValue.toFixed(2)}
              </span>
            )}
          </div>

          {/* Total Payments Received */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-900 rounded-lg text-xs border border-teal-200">
            <span className="text-teal-700 font-medium">Paid:</span>
            <span className="font-bold font-mono text-teal-950">
              {cur}{summary.totalCollections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Balance Amount to Pay (Prominently Highlighted) */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ml-auto shadow-2xs ${
            summary.outstandingBalance > 0
              ? 'bg-rose-50 text-rose-900 border-rose-300 font-bold'
              : 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold'
          }`}>
            <span className={summary.outstandingBalance > 0 ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>
              Balance to Pay:
            </span>
            <span className={`font-mono text-sm font-black ${summary.outstandingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {cur}{summary.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'orders'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Sales Orders & Delivery Fulfillment</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
              {sales.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'ledger'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Account Ledger Statement</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
              {ledger.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('deliveries')}
            className={`pb-3 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'deliveries'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Dispatch & Delivery Log</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
              {allDeliveries.length}
            </span>
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="hidden sm:flex items-center gap-2 pb-2 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
            title="From Date"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
            title="To Date"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-blue-600 hover:underline font-medium text-[11px]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: Sales Orders & Delivery Fulfillment Table */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Sales Orders & Fulfillment Status
              </h3>
              <p className="text-[11px] text-slate-500">
                Track each order's delivered vs pending items, upfront payments, and remaining balance due
              </p>
            </div>
            <button
              onClick={() => handleOpenPaymentModal()}
              className="px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              <CreditCard className="w-3.5 h-3.5 text-amber-600" />
              <span>Record Payment for Client</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Sale # / Date</th>
                  <th className="px-4 py-3.5 text-right">Order Qty</th>
                  <th className="px-4 py-3.5 text-center">Delivery Status</th>
                  <th className="px-4 py-3.5 text-right">Total Price</th>
                  <th className="px-4 py-3.5 text-right">Amount Paid</th>
                  <th className="px-4 py-3.5 text-right bg-slate-800 text-amber-300">Balance Due</th>
                  <th className="px-4 py-3.5 text-center">Payment Status</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      No sales recorded for this customer yet. Click "New Sale" to create one.
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => {
                    const delivered = sale.delivered_quantity || 0;
                    const pending = sale.pending_quantity !== undefined ? sale.pending_quantity : Math.max(0, sale.quantity - delivered);
                    const isFullyDelivered = pending <= 0.005;
                    const isPartiallyDelivered = delivered > 0 && !isFullyDelivered;

                    const paid = sale.amount_paid || 0;
                    const balanceDue = sale.balance_due !== undefined ? sale.balance_due : Math.max(0, sale.total_sales - paid);
                    const isFullyPaid = balanceDue <= 0.005;
                    const isPartiallyPaid = paid > 0 && !isFullyPaid;

                    const isExpanded = expandedSaleId === sale.id;

                    return (
                      <React.Fragment key={sale.id}>
                        <tr className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900 font-mono">Sale #{sale.id}</div>
                            <div className="text-[11px] text-slate-400">{sale.date}</div>
                            {sale.deliveries && sale.deliveries.length > 0 && (
                              <button
                                onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                                className="mt-1 text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                <span>{sale.deliveries.length} dispatch log(s)</span>
                              </button>
                            )}
                          </td>

                          {/* Ordered Quantity with Delivered vs Pending breakdown */}
                          <td className="px-4 py-3.5 text-right font-mono">
                            <div className="font-bold text-slate-900">{sale.quantity} {unit}</div>
                            <div className="text-[11px] text-blue-700">Delivered: {delivered} {unit}</div>
                            {pending > 0 && (
                              <div className="text-[11px] text-amber-700 font-semibold">Pending: {pending} {unit}</div>
                            )}
                          </td>

                          {/* Delivery Status Badge */}
                          <td className="px-4 py-3.5 text-center">
                            {isFullyDelivered ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>DELIVERED</span>
                              </span>
                            ) : isPartiallyDelivered ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                <Truck className="w-3 h-3" />
                                <span>PARTIAL ({delivered}/{sale.quantity})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3" />
                                <span>PENDING</span>
                              </span>
                            )}
                          </td>

                          {/* Total Sale Price */}
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                            {cur}{sale.total_sales.toFixed(2)}
                            <div className="text-[10px] font-normal text-slate-400">
                              @{cur}{sale.selling_price.toFixed(2)}
                            </div>
                          </td>

                          {/* Amount Paid */}
                          <td className="px-4 py-3.5 text-right font-mono text-teal-700 font-semibold">
                            {cur}{paid.toFixed(2)}
                          </td>

                          {/* Balance Due */}
                          <td className="px-4 py-3.5 text-right font-mono font-bold">
                            <span className={balanceDue > 0 ? 'text-rose-600' : 'text-slate-400'}>
                              {cur}{balanceDue.toFixed(2)}
                            </span>
                          </td>

                          {/* Payment Status Badge */}
                          <td className="px-4 py-3.5 text-center">
                            {isFullyPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>PAID</span>
                              </span>
                            ) : isPartiallyPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <span>PARTIAL</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <span>UNPAID</span>
                              </span>
                            )}
                          </td>

                          {/* Row Actions */}
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex flex-col gap-1.5 items-center justify-center">
                              {/* Collect Payment on this sale */}
                              {!isFullyPaid && (
                                <button
                                  onClick={() => handleOpenPaymentModal(sale)}
                                  className="w-full px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-xs flex items-center justify-center gap-1 transition-colors"
                                  title="Record payment against this sale"
                                >
                                  <CreditCard className="w-3 h-3" />
                                  <span>Record Pay</span>
                                </button>
                              )}

                              {/* Dispatch Delivery on this sale */}
                              {!isFullyDelivered && (
                                <button
                                  onClick={() => handleOpenDeliveryModal(sale)}
                                  className="w-full px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-xs flex items-center justify-center gap-1 transition-colors"
                                  title="Dispatch pending product delivery"
                                >
                                  <Truck className="w-3 h-3" />
                                  <span>Deliver</span>
                                </button>
                              )}

                              {isFullyPaid && isFullyDelivered && (
                                <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Completed</span>
                                </span>
                              )}

                              {/* Delete Sale */}
                              <button
                                onClick={() => setSaleToDelete(sale)}
                                className="w-full px-2 py-0.5 text-[10px] font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded flex items-center justify-center gap-1 transition-colors"
                                title="Delete this sale record"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete Sale</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Delivery History for this sale */}
                        {isExpanded && sale.deliveries && sale.deliveries.length > 0 && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={8} className="px-6 py-3 border-y border-slate-200/80">
                              <div className="text-xs space-y-1.5">
                                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Dispatch & Delivery History for Sale #{sale.id}:</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {sale.deliveries.map((del, idx) => (
                                    <div key={del.id || idx} className="p-2 bg-white rounded border border-slate-200 text-[11px]">
                                      <div className="flex justify-between font-bold text-slate-800">
                                        <span>Dispatch #{del.id || idx + 1}</span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono text-blue-700">{del.quantity} {unit}</span>
                                          {del.id && (
                                            <button
                                              onClick={() =>
                                                setDeliveryToDelete({
                                                  id: del.id,
                                                  quantity: del.quantity,
                                                  date: del.date,
                                                  saleId: sale.id,
                                                })
                                              }
                                              className="p-0.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                              title="Delete this dispatch"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-slate-400 text-[10px] mt-0.5">{del.date}</div>
                                      {del.notes && (
                                        <div className="text-slate-600 italic text-[10px] mt-1">{del.notes}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Account Ledger Statement (Amount & Pending Units Records) */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Dual Ledger Principle Banner */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-950">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Dual Financial & Units Fulfillment Ledger:</p>
              <p className="text-blue-900 mt-0.5">
                This statement tracks both the <strong>financial transactions</strong> (Debit for sales, Credit for collections, and net Balance to Pay) and the <strong>physical inventory fulfillment</strong> (Invoiced Units, Delivered Units, and Running Pending Units awaiting delivery).
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Account Ledger Statement (Financial & Units Record)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Chronological transaction history with running balance and pending units
                </p>
              </div>

              {/* Transaction Filter Pills & Action */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      ledgerFilter === 'ALL'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({ledger.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('SALE')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      ledgerFilter === 'SALE'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sales ({ledger.filter((e) => e.transaction_type === 'SALE').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('DELIVERY')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      ledgerFilter === 'DELIVERY'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Deliveries ({ledger.filter((e) => e.transaction_type === 'DELIVERY').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('COLLECTION')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      ledgerFilter === 'COLLECTION'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Payments ({ledger.filter((e) => e.transaction_type === 'COLLECTION').length})
                  </button>
                </div>

                <button
                  onClick={() => handleOpenPaymentModal()}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs flex items-center gap-1 transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Record Payment</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-3 py-3.5">Type</th>
                    <th className="px-4 py-3.5">Particulars / Reference</th>
                    <th className="px-3 py-3.5 text-right">Invoiced Qty</th>
                    <th className="px-3 py-3.5 text-right">Delivered Qty</th>
                    <th className="px-4 py-3.5 text-center bg-slate-800 text-amber-300">Pending Units Record</th>
                    <th className="px-3 py-3.5 text-right">Debit (+)</th>
                    <th className="px-3 py-3.5 text-right">Credit (-)</th>
                    <th className="px-4 py-3.5 text-right bg-slate-800 text-amber-300">Balance to Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const filteredLedger = ledger.filter((entry) => {
                      if (ledgerFilter === 'ALL') return true;
                      return entry.transaction_type === ledgerFilter;
                    });

                    if (filteredLedger.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                            No ledger transactions matching the selected filter.
                          </td>
                        </tr>
                      );
                    }

                    return filteredLedger.map((entry) => {
                      const isSale = entry.transaction_type === 'SALE';
                      const isDelivery = entry.transaction_type === 'DELIVERY';
                      const isCollection = entry.transaction_type === 'COLLECTION';
                      const pending = entry.pending_units !== undefined ? entry.pending_units : 0;
                      const delivered = entry.delivered_quantity || 0;

                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-slate-600 font-mono whitespace-nowrap">{entry.date}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {isSale && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <ShoppingCart className="w-2.5 h-2.5" />
                                <span>SALE</span>
                              </span>
                            )}
                            {isDelivery && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Truck className="w-2.5 h-2.5" />
                                <span>DISPATCH</span>
                              </span>
                            )}
                            {isCollection && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>COLLECTION</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{entry.reference}</td>

                          {/* Invoiced Quantity */}
                          <td className="px-3 py-3 text-right font-mono text-slate-700 whitespace-nowrap">
                            {entry.quantity > 0 ? `${entry.quantity} ${unit}` : '—'}
                          </td>

                          {/* Delivered Quantity */}
                          <td className="px-3 py-3 text-right font-mono whitespace-nowrap">
                            {delivered > 0 ? (
                              <span className="text-emerald-700 font-semibold">+{delivered} {unit}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Pending Units Record */}
                          <td className="px-4 py-3 text-center bg-amber-50/20 whitespace-nowrap">
                            {pending > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock className="w-2.5 h-2.5 text-amber-700" />
                                <span>{pending} {unit} Pending</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <PackageCheck className="w-2.5 h-2.5 text-emerald-600" />
                                <span>Fulfilled (0 pending)</span>
                              </span>
                            )}
                          </td>

                          {/* Debit Amount */}
                          <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {entry.debit > 0 ? `${cur}${entry.debit.toFixed(2)}` : '—'}
                          </td>

                          {/* Credit Amount */}
                          <td className="px-3 py-3 text-right font-mono font-semibold text-teal-700 whitespace-nowrap">
                            {entry.credit > 0 ? `${cur}${entry.credit.toFixed(2)}` : '—'}
                          </td>

                          {/* Running Balance to Pay */}
                          <td className="px-4 py-3 text-right font-mono font-bold bg-slate-100/30 whitespace-nowrap">
                            <span className={entry.balance > 0 ? 'text-rose-700' : 'text-slate-900'}>
                              {cur}{entry.balance.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>

                {/* Ledger Statement Totals Footer */}
                <tfoot className="bg-slate-100 font-semibold text-slate-800 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-slate-600 uppercase text-[11px] font-bold">
                      Statement Summary Totals
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-900">
                      {orderedUnits} {unit}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700 font-bold">
                      {deliveredUnits} {unit}
                    </td>
                    <td className="px-4 py-3 text-center bg-amber-100/50">
                      <span className="font-mono font-bold text-amber-900">
                        {pendingUnits} {unit} Net Pending
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-900">
                      {cur}{(summary?.totalSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-teal-700 font-bold">
                      {cur}{(summary?.totalCollections || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-700 font-bold bg-slate-200/50">
                      {cur}{(summary?.outstandingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Dispatch & Delivery Records Log */}
      {activeTab === 'deliveries' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Product Dispatch & Delivery Log
              </h3>
              <p className="text-[11px] text-slate-500">
                Log of all shipments and product deliveries dispatched to this client
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-white uppercase tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Dispatch Date</th>
                  <th className="px-4 py-3.5">Sale Order Ref</th>
                  <th className="px-4 py-3.5 text-right">Quantity Delivered</th>
                  <th className="px-4 py-3.5">Delivery Notes / Waybill</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allDeliveries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No delivery shipments recorded for this client yet.
                    </td>
                  </tr>
                ) : (
                  allDeliveries.map((del, idx) => (
                    <tr key={del.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-mono">{del.date}</td>
                      <td className="px-4 py-3 font-semibold text-blue-700 font-mono">
                        Sale #{del.sale_id} {del.sale_date ? `(${del.sale_date})` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {del.quantity} {unit}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {del.notes || 'Goods dispatched to customer'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {del.id && (
                          <button
                            onClick={() =>
                              setDeliveryToDelete({
                                id: del.id,
                                quantity: del.quantity,
                                date: del.date,
                                saleId: del.sale_id,
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                            title="Delete dispatch record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Record Payment / Collection */}
      {showPayModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {payTargetSale ? `Record Payment for Sale #${payTargetSale.id}` : 'Record Customer Payment'}
                </h3>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {payModalError && (
              <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{payModalError}</span>
              </div>
            )}

            {/* Target Details */}
            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900">{customer.name}</strong>
              </div>
              {payTargetSale ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sale Order:</span>
                    <strong className="text-slate-900 font-mono">Sale #{payTargetSale.id} ({payTargetSale.date})</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Sale Amount:</span>
                    <span className="font-mono font-bold text-slate-900">{cur}{payTargetSale.total_sales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Units Status:</span>
                    <span className="font-mono text-slate-800">
                      Ordered: <strong>{payTargetSale.quantity} {unit}</strong> | Delivered: <strong>{payTargetSale.delivered_quantity || 0} {unit}</strong>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pending Units for this Order:</span>
                    {((payTargetSale.pending_quantity !== undefined ? payTargetSale.pending_quantity : Math.max(0, payTargetSale.quantity - (payTargetSale.delivered_quantity || 0)))) > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-amber-100 text-amber-900 border border-amber-300">
                        {payTargetSale.pending_quantity !== undefined ? payTargetSale.pending_quantity : Math.max(0, payTargetSale.quantity - (payTargetSale.delivered_quantity || 0))} {unit} Pending Dispatch
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-medium">All Units Dispatched</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Already Paid:</span>
                    <span className="font-mono text-teal-700">{cur}{(payTargetSale.amount_paid || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-rose-700">Remaining Due for this Sale:</span>
                    <span className="font-mono font-bold text-rose-700">
                      {cur}{(payTargetSale.balance_due || Math.max(0, payTargetSale.total_sales - (payTargetSale.amount_paid || 0))).toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Customer Invoiced:</span>
                    <span className="font-mono text-slate-900">{cur}{(summary?.totalSales || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Collections to Date:</span>
                    <span className="font-mono text-teal-700">{cur}{(summary?.totalCollections || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pending Units Awaiting Delivery:</span>
                    {pendingUnits > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-amber-100 text-amber-900 border border-amber-300">
                        {pendingUnits} {unit} Pending Dispatch
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-medium">All Units Dispatched</span>
                    )}
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-rose-700">Net Customer Balance to Pay:</span>
                    <span className="font-mono font-bold text-rose-700">
                      {cur}{(summary?.outstandingBalance || 0).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Payment Amount Received ({cur}) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (payTargetSale) {
                        const due = payTargetSale.balance_due !== undefined ? payTargetSale.balance_due : Math.max(0, payTargetSale.total_sales - (payTargetSale.amount_paid || 0));
                        setPayAmount(String(due));
                      } else {
                        setPayAmount(String(summary?.outstandingBalance || 0));
                      }
                    }}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    Pay Full Due
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">{cur}</span>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="UPI / Online">UPI / Online</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Notes / Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank ref #9821, Cheque #4190, Cash receipt, etc."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPaying}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isPaying ? 'Saving Payment...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Dispatch Product Delivery */}
      {showDeliveryModal && deliveryTargetSale && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Dispatch Product Delivery
                </h3>
              </div>
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deliveryModalError && (
              <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{deliveryModalError}</span>
              </div>
            )}

            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Sale Order:</span>
                <strong className="text-slate-900 font-mono">Sale #{deliveryTargetSale.id} ({deliveryTargetSale.date})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900">{customer.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Ordered Quantity:</span>
                <span className="font-mono font-bold text-slate-900">{deliveryTargetSale.quantity} {unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already Delivered:</span>
                <span className="font-mono text-blue-700 font-bold">{deliveryTargetSale.delivered_quantity || 0} {unit}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-amber-800">Pending Delivery:</span>
                <span className="font-mono font-bold text-amber-800">
                  {deliveryTargetSale.pending_quantity !== undefined
                    ? deliveryTargetSale.pending_quantity
                    : Math.max(0, deliveryTargetSale.quantity - (deliveryTargetSale.delivered_quantity || 0))} {unit}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitDelivery} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Quantity Dispatched Now ({unit}) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const pending = deliveryTargetSale.pending_quantity !== undefined
                        ? deliveryTargetSale.pending_quantity
                        : Math.max(0, deliveryTargetSale.quantity - (deliveryTargetSale.delivered_quantity || 0));
                      setDeliverQty(String(pending));
                    }}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    Dispatch All Remaining
                  </button>
                </div>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={deliverQty}
                  onChange={(e) => setDeliverQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Dispatch Date *
                </label>
                <input
                  type="date"
                  required
                  value={deliverDate}
                  onChange={(e) => setDeliverDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Delivery / Dispatch Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Courier Waybill #4021, Delivery driver John, etc."
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeliveryModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDelivering}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isDelivering ? 'Recording Dispatch...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Sale Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(saleToDelete)}
        title={`Delete Sale #${saleToDelete?.id}`}
        message={`Are you sure you want to delete Sale #${saleToDelete?.id} of ${saleToDelete?.quantity} ${unit} for ${cur}${saleToDelete?.total_sales?.toFixed(2)}?`}
        warningNotice="This will restore the allocated stock back to inventory, cancel related dispatches, and remove the charge from the customer account."
        confirmText="Delete Sale"
        isDeleting={isDeletingSale}
        onConfirm={handleConfirmDeleteSale}
        onClose={() => setSaleToDelete(null)}
      />

      {/* Delete Delivery Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deliveryToDelete)}
        title="Delete Delivery / Dispatch Record"
        message={`Are you sure you want to delete the dispatch record of ${deliveryToDelete?.quantity} ${unit} dispatched on ${deliveryToDelete?.date}?`}
        warningNotice="The dispatched quantity will be restored as pending delivery for this order."
        confirmText="Delete Dispatch"
        isDeleting={isDeletingDelivery}
        onConfirm={handleConfirmDeleteDelivery}
        onClose={() => setDeliveryToDelete(null)}
      />

      {/* Delete Customer Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteCustomerModal}
        title={`Delete Customer "${customer?.name}"`}
        message={`Are you sure you want to delete customer account "${customer?.name}"?`}
        warningNotice="Note: Make sure all sales and payments associated with this customer are deleted first."
        confirmText="Delete Customer Account"
        isDeleting={isDeletingCustomer}
        onConfirm={handleConfirmDeleteCustomer}
        onClose={() => setShowDeleteCustomerModal(false)}
      />
    </div>
  );
};
