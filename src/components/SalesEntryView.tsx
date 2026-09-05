import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Info,
  DollarSign,
  Calculator,
  UserPlus,
  ArrowRight,
  Layers,
  CreditCard,
  Truck,
  Clock,
  CheckCheck,
  RefreshCw,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import { api } from '../api';
import { Customer, StockBatch, Settings, Sale, SaleDelivery } from '../types';
import { exportSalesCsv } from '../utils/csvExport';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface BatchRowItem {
  batch_id: number;
  quantity: number;
}

interface SaleRowForm {
  id: string;
  date: string;
  customer_id: number;
  quantity: number;
  selling_price: number;
  allocationMode: 'single' | 'multiple';
  singleBatchId: number;
  batchAllocations: BatchRowItem[];
  // Partial payment fields
  paymentType: 'unpaid' | 'partial' | 'full';
  amount_paid: number;
  payment_method: string;
  payment_notes: string;
  // Partial delivery fields
  deliveryType: 'full' | 'partial' | 'pending';
  delivered_quantity: number;
  delivery_notes: string;
}

interface SalesEntryViewProps {
  settings: Settings;
  onSalesSaved: () => void;
  onNavigateToCustomer: (customerId: number) => void;
}

export const SalesEntryView: React.FC<SalesEntryViewProps> = ({
  settings,
  onSalesSaved,
  onNavigateToCustomer,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const today = new Date().toISOString().split('T')[0];

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [salesFilter, setSalesFilter] = useState<'ALL' | 'UNPAID' | 'PENDING_DELIVERY'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Quick Customer Creation modal inside sales entry
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // Collect Payment Modal state
  const [paymentModalSale, setPaymentModalSale] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(today);
  const [payMethod, setPayMethod] = useState<string>('Cash');
  const [payNotes, setPayNotes] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Dispatch Delivery Modal state
  const [deliveryModalSale, setDeliveryModalSale] = useState<Sale | null>(null);
  const [deliverQty, setDeliverQty] = useState<string>('');
  const [deliverDate, setDeliverDate] = useState<string>(today);
  const [deliverNotes, setDeliverNotes] = useState<string>('');
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);

  // Delivery History modal
  const [viewHistorySale, setViewHistorySale] = useState<Sale | null>(null);

  // Delete Sale confirmation state
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [isDeletingSale, setIsDeletingSale] = useState(false);

  // Delete Delivery confirmation state
  const [deliveryToDelete, setDeliveryToDelete] = useState<{ id: number; quantity: number; saleId: number } | null>(null);
  const [isDeletingDelivery, setIsDeletingDelivery] = useState(false);

  // Initial sales rows state
  const createEmptyRow = (defaultDate = today): SaleRowForm => ({
    id: Math.random().toString(36).substring(2, 9),
    date: defaultDate,
    customer_id: 0,
    quantity: 0,
    selling_price: 0,
    allocationMode: 'single',
    singleBatchId: 0,
    batchAllocations: [],
    paymentType: 'full',
    amount_paid: 0,
    payment_method: 'Cash',
    payment_notes: '',
    deliveryType: 'full',
    delivered_quantity: 0,
    delivery_notes: '',
  });

  const [salesRows, setSalesRows] = useState<SaleRowForm[]>([createEmptyRow()]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [custRes, batchRes, salesRes] = await Promise.all([
        api.getCustomers(),
        api.getBatches(),
        api.getSales(),
      ]);
      setCustomers(custRes);
      setBatches(batchRes.batches);
      setAllSales(salesRes);

      // If we have active batches and the first row has no batch selected, pre-select the first active batch
      const firstActive = batchRes.batches.find((b) => b.remaining_quantity > 0);
      if (firstActive) {
        setSalesRows((prev) =>
          prev.map((row) => (row.singleBatchId === 0 ? { ...row, singleBatchId: firstActive.id } : row))
        );
      }
    } catch (err) {
      console.error('Failed to load sales entry data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeBatches = batches.filter((b) => b.remaining_quantity > 0);

  // Auto FIFO allocation helper
  const autoAllocateFIFO = (rowId: string) => {
    setSalesRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const targetQty = row.quantity;
        if (targetQty <= 0) return row;

        let needed = targetQty;
        const newAllocations: BatchRowItem[] = [];

        // Sort active batches by purchase date / id ascending (FIFO)
        const sorted = [...activeBatches].sort((a, b) => a.id - b.id);
        for (const b of sorted) {
          if (needed <= 0) break;
          const take = Math.min(needed, b.remaining_quantity);
          if (take > 0) {
            newAllocations.push({ batch_id: b.id, quantity: Math.round(take * 100) / 100 });
            needed -= take;
          }
        }

        if (newAllocations.length === 1) {
          return {
            ...row,
            allocationMode: 'single',
            singleBatchId: newAllocations[0].batch_id,
            batchAllocations: newAllocations,
          };
        } else {
          return {
            ...row,
            allocationMode: 'multiple',
            batchAllocations: newAllocations,
          };
        }
      })
    );
  };

  const handleAddRow = () => {
    const firstActive = activeBatches[0];
    const newRow = createEmptyRow();
    if (firstActive) newRow.singleBatchId = firstActive.id;
    setSalesRows((prev) => [...prev, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    if (salesRows.length <= 1) return;
    setSalesRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, updates: Partial<SaleRowForm>) => {
    setSalesRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...updates };

        // If in single batch mode, ensure batchAllocations matches single batch
        if (updated.allocationMode === 'single') {
          if (updated.singleBatchId) {
            updated.batchAllocations = [{ batch_id: updated.singleBatchId, quantity: updated.quantity }];
          }
        } else if (updated.allocationMode === 'multiple') {
          // If batch allocations were updated, keep row.quantity in exact sync with sum of allocations
          if (updates.batchAllocations !== undefined) {
            const sum = Math.round(
              updates.batchAllocations.reduce((acc, curr) => acc + (parseFloat(String(curr.quantity)) || 0), 0) * 100
            ) / 100;
            if (sum > 0 || updated.quantity === 0) {
              updated.quantity = sum;
            }
          }
        }
        return updated;
      })
    );
  };

  // Helper to compute cost, profit, payment balance, and delivery pending for a row
  const getRowCalculations = (row: SaleRowForm) => {
    let totalAllocatedQty = 0;
    let actualPurchaseCost = 0;

    const allocations =
      row.allocationMode === 'single'
        ? [{ batch_id: row.singleBatchId, quantity: row.quantity }]
        : row.batchAllocations;

    allocations.forEach((alloc) => {
      const b = batches.find((item) => item.id === alloc.batch_id);
      if (b) {
        const aQty = parseFloat(String(alloc.quantity)) || 0;
        totalAllocatedQty += aQty;
        actualPurchaseCost += aQty * b.unit_cost;
      }
    });

    totalAllocatedQty = Math.round(totalAllocatedQty * 100) / 100;
    actualPurchaseCost = Math.round(actualPurchaseCost * 100) / 100;

    // For multi-batch mode, effective quantity is the total allocated quantity if provided
    const effectiveQty =
      row.allocationMode === 'multiple' && totalAllocatedQty > 0
        ? totalAllocatedQty
        : (parseFloat(String(row.quantity)) || 0);

    const sellingPrice = parseFloat(String(row.selling_price)) || 0;
    const totalSales = Math.round(effectiveQty * sellingPrice * 100) / 100;
    const profit = Math.round((totalSales - actualPurchaseCost) * 100) / 100;
    const avgUnitCost = effectiveQty > 0 ? Math.round((actualPurchaseCost / effectiveQty) * 100) / 100 : 0;
    const profitMargin = totalSales > 0 ? Math.round((profit / totalSales) * 1000) / 10 : 0;
    const isAllocationMatching =
      row.allocationMode === 'single'
        ? row.quantity > 0 && row.singleBatchId > 0
        : totalAllocatedQty > 0 && Math.abs(totalAllocatedQty - row.quantity) < 0.001;

    // Payment calculations
    let safeAmountPaid = 0;
    if (row.paymentType === 'full') {
      safeAmountPaid = totalSales;
    } else if (row.paymentType === 'partial') {
      const entered = parseFloat(String(row.amount_paid)) || 0;
      safeAmountPaid = Math.max(0, Math.min(Math.round(entered * 100) / 100, totalSales));
    } else {
      safeAmountPaid = 0;
    }
    const customerBalanceToPay = Math.max(0, Math.round((totalSales - safeAmountPaid) * 100) / 100);

    // Delivery calculations
    let safeDeliveredQty = 0;
    if (row.deliveryType === 'full') {
      safeDeliveredQty = effectiveQty;
    } else if (row.deliveryType === 'partial') {
      const enteredQty = parseFloat(String(row.delivered_quantity)) || 0;
      safeDeliveredQty = Math.max(0, Math.min(Math.round(enteredQty * 100) / 100, effectiveQty));
    } else {
      safeDeliveredQty = 0;
    }
    const pendingDeliveryQty = Math.max(0, Math.round((effectiveQty - safeDeliveredQty) * 100) / 100);

    return {
      totalSales,
      totalAllocatedQty,
      actualPurchaseCost,
      profit,
      avgUnitCost,
      profitMargin,
      effectiveQty,
      isAllocationMatching,
      safeAmountPaid,
      customerBalanceToPay,
      safeDeliveredQty,
      pendingDeliveryQty,
    };
  };

  // Quick Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;
    try {
      const res = await api.createCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
      });
      const newCustId = res.data?.id;
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowAddCustomerModal(false);
      await loadData();
      if (newCustId) {
        setSalesRows((prev) =>
          prev.map((r, idx) => (idx === 0 && r.customer_id === 0 ? { ...r, customer_id: newCustId } : r))
        );
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create customer');
    }
  };

  // Save All Sales
  const handleSaveAllSales = async () => {
    setStatusMessage(null);

    // Validate all rows
    const payload = [];

    for (let i = 0; i < salesRows.length; i++) {
      const row = salesRows[i];
      const rowNum = i + 1;
      const prefix = salesRows.length > 1 ? `Row ${rowNum}: ` : '';
      const rowCalcs = getRowCalculations(row);

      if (!row.customer_id) {
        setStatusMessage({ type: 'error', text: `${prefix}Please select a customer.` });
        return;
      }
      if (row.quantity <= 0) {
        setStatusMessage({ type: 'error', text: `${prefix}Quantity must be greater than zero.` });
        return;
      }
      if (row.selling_price < 0) {
        setStatusMessage({ type: 'error', text: `${prefix}Selling price must be valid.` });
        return;
      }

      const allocations =
        row.allocationMode === 'single'
          ? [{ batch_id: row.singleBatchId, quantity: row.quantity }]
          : row.batchAllocations.filter((b) => (parseFloat(String(b.quantity)) || 0) > 0);

      if (!allocations.length) {
        setStatusMessage({ type: 'error', text: `${prefix}Please allocate stock from at least one batch.` });
        return;
      }

      const allocSum = Math.round(allocations.reduce((acc, curr) => acc + curr.quantity, 0) * 100) / 100;
      const finalQuantity = row.allocationMode === 'multiple' ? allocSum : row.quantity;

      if (finalQuantity <= 0) {
        setStatusMessage({ type: 'error', text: `${prefix}Sale quantity must be greater than zero.` });
        return;
      }

      // Check stock limits
      for (const alloc of allocations) {
        const b = batches.find((batch) => batch.id === alloc.batch_id);
        if (!b) {
          setStatusMessage({ type: 'error', text: `${prefix}Batch not found.` });
          return;
        }
        if (alloc.quantity > b.remaining_quantity) {
          setStatusMessage({
            type: 'error',
            text: `${prefix}Batch ${b.batch_number} has only ${b.remaining_quantity} ${unit} available, but ${alloc.quantity} was requested.`,
          });
          return;
        }
      }

      payload.push({
        date: row.date,
        customer_id: row.customer_id,
        quantity: finalQuantity,
        selling_price: row.selling_price,
        batches: allocations,
        amount_paid: rowCalcs.safeAmountPaid,
        payment_method: row.payment_method || 'Cash',
        payment_notes: row.payment_notes || undefined,
        delivered_quantity: rowCalcs.safeDeliveredQty,
        delivery_notes: row.delivery_notes || undefined,
      });
    }

    setIsSubmitting(true);
    try {
      const res = await api.createSales(payload);
      setStatusMessage({
        type: 'success',
        text: res.message || 'All sales recorded successfully! Inventory, customer ledger, collections, and deliveries updated automatically.',
      });

      // Reset rows to 1 fresh row
      const firstActive = batches.find((b) => b.remaining_quantity > 0);
      const freshRow = createEmptyRow();
      if (firstActive) freshRow.singleBatchId = firstActive.id;
      setSalesRows([freshRow]);

      await loadData();
      onSalesSaved();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save sales.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Payment Modal for a sale
  const handleOpenPaymentModal = (sale: Sale) => {
    setPaymentModalSale(sale);
    setPayAmount(String(sale.balance_due || 0));
    setPayDate(today);
    setPayMethod('Cash');
    setPayNotes('');
  };

  // Submit Payment for a sale
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSale) return;

    const numAmt = parseFloat(payAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      alert('Please enter a valid payment amount greater than 0');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await api.recordSalePayment(paymentModalSale.id, {
        amount: numAmt,
        date: payDate,
        payment_method: payMethod,
        notes: payNotes.trim() || undefined,
      });

      setPaymentModalSale(null);
      setStatusMessage({
        type: 'success',
        text: res.message || `Payment of ${cur}${numAmt.toFixed(2)} recorded successfully!`,
      });
      await loadData();
      onSalesSaved();
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Delivery Modal for a sale
  const handleOpenDeliveryModal = (sale: Sale) => {
    setDeliveryModalSale(sale);
    setDeliverQty(String(sale.pending_quantity || (sale.quantity - (sale.delivered_quantity || 0))));
    setDeliverDate(today);
    setDeliverNotes('');
  };

  // Submit Delivery for a sale
  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryModalSale) return;

    const numQty = parseFloat(deliverQty);
    if (isNaN(numQty) || numQty <= 0) {
      alert('Please enter a valid delivery quantity greater than 0');
      return;
    }

    setIsSubmittingDelivery(true);
    try {
      const res = await api.recordSaleDelivery(deliveryModalSale.id, {
        quantity: numQty,
        date: deliverDate,
        notes: deliverNotes.trim() || undefined,
      });

      setDeliveryModalSale(null);
      setStatusMessage({
        type: 'success',
        text: res.message || `Delivery of ${numQty} ${unit} logged successfully!`,
      });
      await loadData();
      onSalesSaved();
    } catch (err: any) {
      alert(err.message || 'Failed to record delivery');
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  // Confirm delete sale
  const handleConfirmDeleteSale = async () => {
    if (!saleToDelete) return;
    setIsDeletingSale(true);
    try {
      const res = await api.deleteSale(saleToDelete.id);
      setStatusMessage({
        type: 'success',
        text: res.message || `Sale #${saleToDelete.id} deleted successfully and inventory restored.`,
      });
      setSaleToDelete(null);
      await loadData();
      onSalesSaved();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete sale.' });
    } finally {
      setIsDeletingSale(false);
    }
  };

  // Confirm delete delivery
  const handleConfirmDeleteDelivery = async () => {
    if (!deliveryToDelete) return;
    setIsDeletingDelivery(true);
    try {
      const res = await api.deleteDelivery(deliveryToDelete.id);
      setStatusMessage({
        type: 'success',
        text: res.message || `Delivery record deleted successfully.`,
      });
      setDeliveryToDelete(null);
      setViewHistorySale(null);
      await loadData();
      onSalesSaved();
    } catch (err: any) {
      alert(err.message || 'Failed to delete delivery');
    } finally {
      setIsDeletingDelivery(false);
    }
  };

  // Grand totals of all rows currently being edited
  const calculatedRows = salesRows.map((r) => getRowCalculations(r));
  const grandTotalQuantity = Math.round(calculatedRows.reduce((acc, c) => acc + c.effectiveQty, 0) * 100) / 100;
  const grandTotalSales = Math.round(calculatedRows.reduce((acc, c) => acc + c.totalSales, 0) * 100) / 100;
  const grandTotalCost = Math.round(calculatedRows.reduce((acc, c) => acc + c.actualPurchaseCost, 0) * 100) / 100;
  const grandTotalProfit = Math.round((grandTotalSales - grandTotalCost) * 100) / 100;
  const grandTotalUpfrontPaid = Math.round(calculatedRows.reduce((acc, c) => acc + c.safeAmountPaid, 0) * 100) / 100;
  const grandTotalBalanceToPay = Math.round(calculatedRows.reduce((acc, c) => acc + c.customerBalanceToPay, 0) * 100) / 100;
  const grandTotalDeliveredUnits = Math.round(calculatedRows.reduce((acc, c) => acc + c.safeDeliveredQty, 0) * 100) / 100;
  const grandTotalPendingUnits = Math.round(calculatedRows.reduce((acc, c) => acc + c.pendingDeliveryQty, 0) * 100) / 100;

  // Filtered sales for history table
  const filteredSales = allSales.filter((s) => {
    if (salesFilter === 'UNPAID') return (s.balance_due || 0) > 0;
    if (salesFilter === 'PENDING_DELIVERY') return (s.pending_quantity || 0) > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sales Entry & Fulfillment</h2>
          <p className="text-sm text-slate-500">
            Record sales with multi-batch stock, partial payment balance tracking, and partial delivery fulfillment
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddCustomerModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Principle Reminder Banner */}
      <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80 flex items-start gap-2.5 text-xs text-emerald-950">
        <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Automatic Real-Time Sync:</p>
          <p className="text-emerald-900 leading-relaxed">
            • <strong>Partial Payment:</strong> If customer doesn't pay full amount today, their remaining unpaid balance is tracked automatically in their Customer Account and reports.
            <br />
            • <strong>Partial Delivery:</strong> If product delivery is partial or pending, stock is allocated and dispatch logs track delivered vs pending units.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-lg text-xs flex items-center gap-2.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
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

      {/* Multiple Sales Rows Container */}
      <div className="space-y-5">
        {salesRows.map((row, index) => {
          const rowCalcs = getRowCalculations(row);
          const selectedSingleBatch = batches.find((b) => b.id === row.singleBatchId);

          return (
            <div
              key={row.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 transition-all hover:border-slate-300"
            >
              {/* Row Top Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Sale Row #{index + 1}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => autoAllocateFIFO(row.id)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                    title="Auto-distribute required quantity across oldest available stock batches (FIFO)"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Auto-allocate (FIFO)</span>
                  </button>

                  {salesRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                      title="Remove this row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row Core Info Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={row.date}
                    onChange={(e) => updateRow(row.id, { date: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Customer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                      Customer *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddCustomerModal(true)}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 hover:underline flex items-center gap-0.5"
                    >
                      + Add Customer
                    </button>
                  </div>
                  <select
                    value={row.customer_id}
                    onChange={(e) => updateRow(row.id, { customer_id: parseInt(e.target.value, 10) })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={0}>-- Select Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.outstanding_balance > 0 ? `(Prior Due: ${cur}${c.outstanding_balance.toFixed(2)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Total Quantity ({unit}) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    placeholder="e.g. 20"
                    value={row.quantity || ''}
                    onChange={(e) => updateRow(row.id, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Selling Price */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Selling Price / {unit} ({cur}) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-400 text-xs">{cur}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 30.00"
                      value={row.selling_price || ''}
                      onChange={(e) => updateRow(row.id, { selling_price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-6 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Batch Stock Allocation Box */}
              <div className="mt-3.5 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Batch Stock Selection:</span>
                    <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { allocationMode: 'single' })}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          row.allocationMode === 'single'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Single Batch
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateRow(row.id, {
                            allocationMode: 'multiple',
                            batchAllocations:
                              row.batchAllocations.length > 0
                                ? row.batchAllocations
                                : [{ batch_id: activeBatches[0]?.id || 0, quantity: row.quantity }],
                          });
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          row.allocationMode === 'multiple'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Multiple Batches
                      </button>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-500">
                    {activeBatches.length} active batches available in inventory
                  </span>
                </div>

                {/* Single Batch Selection */}
                {row.allocationMode === 'single' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <select
                        value={row.singleBatchId}
                        onChange={(e) => updateRow(row.id, { singleBatchId: parseInt(e.target.value, 10) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                      >
                        <option value={0}>-- Select Batch --</option>
                        {batches.map((b) => (
                          <option key={b.id} value={b.id} disabled={b.remaining_quantity <= 0}>
                            {b.batch_number} — Available: {b.remaining_quantity} {unit} @ Cost: {cur}
                            {b.unit_cost.toFixed(2)} {b.remaining_quantity <= 0 ? '(Exhausted)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedSingleBatch && (
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2.5">
                        <span>
                          Available:{' '}
                          <strong
                            className={
                              selectedSingleBatch.remaining_quantity >= row.quantity
                                ? 'text-emerald-700 font-mono'
                                : 'text-rose-600 font-mono'
                            }
                          >
                            {selectedSingleBatch.remaining_quantity} {unit}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Batch Cost:{' '}
                          <strong className="text-slate-800 font-mono">
                            {cur}{selectedSingleBatch.unit_cost.toFixed(2)}
                          </strong>
                        </span>
                        {row.quantity > selectedSingleBatch.remaining_quantity && (
                          <span className="text-[11px] text-rose-600 font-bold">
                            ⚠️ Exceeds batch stock! Switch to Multiple Batches.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Multiple Batches Split Allocation */
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-600">
                        Specify exact quantity taken from each batch. The sale draws cost from each batch proportionally.
                      </p>
                      <button
                        type="button"
                        onClick={() => autoAllocateFIFO(row.id)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Layers className="w-3 h-3" />
                        <span>Re-balance FIFO</span>
                      </button>
                    </div>

                    {row.batchAllocations.map((alloc, aIdx) => {
                      const b = batches.find((item) => item.id === alloc.batch_id);
                      const aQty = parseFloat(String(alloc.quantity)) || 0;
                      const batchCost = b ? aQty * b.unit_cost : 0;
                      const batchRev = aQty * (row.selling_price || 0);
                      const batchProfit = batchRev - batchCost;

                      return (
                        <div key={aIdx} className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center gap-3">
                          <select
                            value={alloc.batch_id}
                            onChange={(e) => {
                              const newId = parseInt(e.target.value, 10);
                              const updated = [...row.batchAllocations];
                              updated[aIdx] = { ...updated[aIdx], batch_id: newId };
                              updateRow(row.id, { batchAllocations: updated });
                            }}
                            className="w-56 px-2 py-1.5 rounded border border-slate-300 text-xs font-mono bg-white"
                          >
                            {batches.map((batch) => (
                              <option key={batch.id} value={batch.id} disabled={batch.remaining_quantity <= 0}>
                                {batch.batch_number} (Avail: {batch.remaining_quantity} @ {cur}
                                {batch.unit_cost.toFixed(2)}) {batch.remaining_quantity <= 0 ? '(Exhausted)' : ''}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Qty:</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={alloc.quantity || ''}
                              onChange={(e) => {
                                const newQty = parseFloat(e.target.value) || 0;
                                const updated = [...row.batchAllocations];
                                updated[aIdx] = { ...updated[aIdx], quantity: newQty };
                                updateRow(row.id, { batchAllocations: updated });
                              }}
                              className="w-20 px-2 py-1 rounded border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                            />
                            <span className="text-xs text-slate-500">{unit}</span>
                            {b && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...row.batchAllocations];
                                  updated[aIdx] = { ...updated[aIdx], quantity: b.remaining_quantity };
                                  updateRow(row.id, { batchAllocations: updated });
                                }}
                                className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                                title="Use all remaining stock in this batch"
                              >
                                Max ({b.remaining_quantity})
                              </button>
                            )}
                          </div>

                          {b && (
                            <div className="flex items-center gap-2.5 text-xs text-slate-600 ml-auto font-mono">
                              <span>
                                Cost: <strong className="text-slate-800">{cur}{batchCost.toFixed(2)}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Sales: <strong className="text-slate-900">{cur}{batchRev.toFixed(2)}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Profit:{' '}
                                <strong className={batchProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                  {batchProfit >= 0 ? '+' : ''}{cur}{batchProfit.toFixed(2)}
                                </strong>
                              </span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const updated = row.batchAllocations.filter((_, idx) => idx !== aIdx);
                              updateRow(row.id, { batchAllocations: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 ml-1"
                            title="Remove batch split"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        const firstActive = activeBatches[0];
                        if (firstActive) {
                          updateRow(row.id, {
                            batchAllocations: [...row.batchAllocations, { batch_id: firstActive.id, quantity: 0 }],
                          });
                        }
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Another Batch to this Sale</span>
                    </button>
                  </div>
                )}
              </div>

              {/* PAYMENT & DELIVERY FULFILLMENT SECTION */}
              <div className="mt-3.5 grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* 1. Partial Payment Tracking */}
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-amber-700" />
                      <span className="text-xs font-bold text-slate-800">Customer Payment Terms</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-amber-200 text-xs">
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { paymentType: 'full', amount_paid: rowCalcs.totalSales })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.paymentType === 'full' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Full Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { paymentType: 'partial', amount_paid: Math.round(rowCalcs.totalSales / 2) })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.paymentType === 'partial' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Partial Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { paymentType: 'unpaid', amount_paid: 0 })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.paymentType === 'unpaid' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Credit (0 Paid)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Amount Paid Upfront ({cur})
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">{cur}</span>
                        <input
                          type="number"
                          min="0"
                          max={rowCalcs.totalSales}
                          step="0.01"
                          disabled={row.paymentType !== 'partial'}
                          value={row.paymentType === 'full' ? rowCalcs.totalSales : (row.paymentType === 'unpaid' ? 0 : (row.amount_paid || ''))}
                          onChange={(e) => updateRow(row.id, { amount_paid: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-6 pr-2.5 py-1 rounded border border-slate-300 text-xs font-mono text-slate-900 bg-white disabled:bg-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Customer Balance to Pay
                      </label>
                      <div className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center justify-between border ${
                        rowCalcs.customerBalanceToPay > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        <span>Due:</span>
                        <span>{cur}{rowCalcs.customerBalanceToPay.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Method & Notes if paid > 0 */}
                  {rowCalcs.safeAmountPaid > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-amber-200/60">
                      <div>
                        <span className="block text-[10px] text-slate-500 font-medium mb-0.5">Payment Method:</span>
                        <select
                          value={row.payment_method}
                          onChange={(e) => updateRow(row.id, { payment_method: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        >
                          <option value="Cash">Cash</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Mobile Money">Mobile Money</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Card">Card</option>
                        </select>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-medium mb-0.5">Reference / Notes:</span>
                        <input
                          type="text"
                          placeholder="e.g. Receipt #1042"
                          value={row.payment_notes}
                          onChange={(e) => updateRow(row.id, { payment_notes: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Partial Delivery Tracking */}
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-700" />
                      <span className="text-xs font-bold text-slate-800">Product Delivery Fulfillment</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-blue-200 text-xs">
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { deliveryType: 'full', delivered_quantity: rowCalcs.effectiveQty })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.deliveryType === 'full' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Full Delivered
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { deliveryType: 'partial', delivered_quantity: Math.round(rowCalcs.effectiveQty / 2) })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.deliveryType === 'partial' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Partial
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { deliveryType: 'pending', delivered_quantity: 0 })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.deliveryType === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pending Later
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Dispatched Now ({unit})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={rowCalcs.effectiveQty}
                        step="any"
                        disabled={row.deliveryType !== 'partial'}
                        value={row.deliveryType === 'full' ? rowCalcs.effectiveQty : (row.deliveryType === 'pending' ? 0 : (row.delivered_quantity || ''))}
                        onChange={(e) => updateRow(row.id, { delivered_quantity: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2.5 py-1 rounded border border-slate-300 text-xs font-mono text-slate-900 bg-white disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Pending Delivery
                      </label>
                      <div className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center justify-between border ${
                        rowCalcs.pendingDeliveryQty > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        <span>Pending:</span>
                        <span>{rowCalcs.pendingDeliveryQty} {unit}</span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery dispatch notes */}
                  <div className="mt-2 pt-2 border-t border-blue-200/60">
                    <input
                      type="text"
                      placeholder="Delivery dispatch notes (e.g. Dispatched by Truck #2, remainder pending next week)"
                      value={row.delivery_notes}
                      onChange={(e) => updateRow(row.id, { delivery_notes: e.target.value })}
                      className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Row Live Summary Bar */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <span className="text-slate-500">Sale Total: </span>
                    <strong className="text-slate-900 font-mono text-sm">{cur}{rowCalcs.totalSales.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Actual Cost: </span>
                    <strong className="text-slate-700 font-mono">{cur}{rowCalcs.actualPurchaseCost.toFixed(2)}</strong>
                    {rowCalcs.effectiveQty > 0 && (
                      <span className="text-[11px] text-slate-400 ml-1">
                        ({cur}{rowCalcs.avgUnitCost.toFixed(2)}/{unit})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500">Profit: </span>
                    <strong
                      className={`font-mono text-sm ${
                        rowCalcs.profit >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'
                      }`}
                    >
                      {rowCalcs.profit >= 0 ? '+' : ''}{cur}{rowCalcs.profit.toFixed(2)}
                    </strong>
                    {rowCalcs.totalSales > 0 && (
                      <span className="text-[11px] text-emerald-700 font-semibold ml-1">
                        ({rowCalcs.profitMargin.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    rowCalcs.customerBalanceToPay > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {rowCalcs.customerBalanceToPay > 0 ? `Unpaid Balance: ${cur}${rowCalcs.customerBalanceToPay.toFixed(2)}` : 'Fully Paid'}
                  </span>

                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    rowCalcs.pendingDeliveryQty > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {rowCalcs.pendingDeliveryQty > 0 ? `Delivery Pending: ${rowCalcs.pendingDeliveryQty} ${unit}` : 'Fully Delivered'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Actions Bar with Combined Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <button
          type="button"
          id="btn-add-sale-row"
          onClick={handleAddRow}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>ADD SALE ROW</span>
        </button>

        <div className="flex flex-wrap items-center gap-5">
          <div className="text-right text-xs space-y-0.5">
            <div className="text-slate-500">
              Total Invoiced: <strong className="font-mono text-slate-900 text-sm font-bold">{cur}{grandTotalSales.toFixed(2)}</strong>
            </div>
            <div className="text-slate-500">
              Upfront Paid: <strong className="font-mono text-emerald-700 font-bold">{cur}{grandTotalUpfrontPaid.toFixed(2)}</strong>
              {grandTotalBalanceToPay > 0 && (
                <span className="text-rose-600 font-semibold ml-1.5">
                  (Due: {cur}{grandTotalBalanceToPay.toFixed(2)})
                </span>
              )}
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 border-l border-slate-200 pl-4">
            <div className="text-slate-500">
              Units: <strong className="font-mono text-slate-800">{grandTotalQuantity} {unit}</strong>
              {grandTotalPendingUnits > 0 && (
                <span className="text-amber-700 font-semibold ml-1.5">
                  ({grandTotalPendingUnits} pending)
                </span>
              )}
            </div>
            <div className="text-slate-500">
              Profit:{' '}
              <strong className={`font-mono text-sm font-bold ${grandTotalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {grandTotalProfit >= 0 ? '+' : ''}{cur}{grandTotalProfit.toFixed(2)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            id="btn-save-all-sales"
            disabled={isSubmitting}
            onClick={handleSaveAllSales}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving All Sales...' : 'SAVE ALL SALES'}</span>
          </button>
        </div>
      </div>

      {/* SALES ORDERS & FULFILLMENT LIST */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Sales Records & Fulfillment</h3>
            <p className="text-[11px] text-slate-500">Track partial customer payments, unpaid balance, and pending stock deliveries</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setSalesFilter('ALL')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  salesFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({allSales.length})
              </button>
              <button
                onClick={() => setSalesFilter('UNPAID')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  salesFilter === 'UNPAID' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unpaid Balance ({allSales.filter((s) => (s.balance_due || 0) > 0).length})
              </button>
              <button
                onClick={() => setSalesFilter('PENDING_DELIVERY')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  salesFilter === 'PENDING_DELIVERY' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pending Delivery ({allSales.filter((s) => (s.pending_quantity || 0) > 0).length})
              </button>
            </div>

            <button
              id="btn-export-sales-table"
              onClick={() => exportSalesCsv(filteredSales.length > 0 ? filteredSales : allSales, settings)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-xs transition-colors"
              title="Export sales orders and fulfillment history into CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export Sales CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Sale # & Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Batches Used</th>
                <th className="px-4 py-3">Delivery Fulfillment</th>
                <th className="px-4 py-3 text-right">Payment & Balance</th>
                <th className="px-4 py-3 text-right">Profit</th>
                <th className="px-4 py-3 text-center">Fulfillment Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No sales found matching this filter.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isPaid = (sale.balance_due || 0) <= 0;
                  const isDelivered = (sale.pending_quantity || 0) <= 0;

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Sale # & Date */}
                      <td className="px-4 py-3 text-slate-600">
                        <span className="font-bold text-slate-900 block">Sale #{sale.id}</span>
                        <span className="text-[11px] text-slate-500">{sale.date}</span>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <button
                          onClick={() => onNavigateToCustomer(sale.customer_id)}
                          className="hover:text-emerald-700 hover:underline"
                        >
                          {sale.customer_name}
                        </button>
                      </td>

                      {/* Batches Used */}
                      <td className="px-4 py-3 text-slate-600">
                        {sale.batchDetails && sale.batchDetails.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {sale.batchDetails.map((b, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono"
                              >
                                {b.batch_number}: {b.quantity} @ {cur}{b.unit_cost.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Delivery Status */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              sale.delivery_status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sale.delivery_status === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {sale.delivery_status || 'PENDING'}
                            </span>
                            <span className="font-mono text-slate-800 font-semibold">
                              {sale.delivered_quantity || 0} / {sale.quantity} {unit}
                            </span>
                          </div>

                          {sale.pending_quantity !== undefined && sale.pending_quantity > 0 && (
                            <div className="text-[11px] text-amber-800 font-medium">
                              ⏳ {sale.pending_quantity} {unit} pending delivery
                            </div>
                          )}

                          {sale.deliveries && sale.deliveries.length > 0 && (
                            <button
                              onClick={() => setViewHistorySale(sale)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              <span>{sale.deliveries.length} dispatch record(s)</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Payment Status & Balance */}
                      <td className="px-4 py-3 text-right">
                        <div className="space-y-0.5 font-mono">
                          <div className="font-bold text-slate-900 text-xs">
                            Total: {cur}{sale.total_sales.toFixed(2)}
                          </div>
                          <div className="text-[11px] text-emerald-700">
                            Paid: {cur}{(sale.amount_paid || 0).toFixed(2)}
                          </div>
                          <div className={`text-xs font-bold ${
                            (sale.balance_due || 0) > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}>
                            {(sale.balance_due || 0) > 0 ? `Due: ${cur}${sale.balance_due?.toFixed(2)}` : 'Fully Paid'}
                          </div>
                        </div>
                      </td>

                      {/* Profit */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        +{cur}{sale.profit.toFixed(2)}
                      </td>

                      {/* Fulfillment Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col gap-1.5 items-center justify-center">
                          {/* Payment Collection Button */}
                          {!isPaid ? (
                            <button
                              onClick={() => handleOpenPaymentModal(sale)}
                              className="w-full px-2.5 py-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white rounded shadow-xs flex items-center justify-center gap-1 transition-colors"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>Collect Pay</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>Paid</span>
                            </span>
                          )}

                          {/* Delivery Dispatch Button */}
                          {!isDelivered ? (
                            <button
                              onClick={() => handleOpenDeliveryModal(sale)}
                              className="w-full px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-xs flex items-center justify-center gap-1 transition-colors"
                            >
                              <Truck className="w-3 h-3" />
                              <span>Dispatch</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Delivered</span>
                            </span>
                          )}

                          {/* Delete Sale Button */}
                          <button
                            onClick={() => setSaleToDelete(sale)}
                            className="w-full px-2 py-0.5 text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded flex items-center justify-center gap-1 transition-colors mt-0.5"
                            title="Delete Sale & Restore Inventory"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Collect Customer Payment */}
      {paymentModalSale && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Record Customer Payment</h3>
              </div>
              <button
                onClick={() => setPaymentModalSale(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Sale Order:</span>
                <strong className="text-slate-900 font-mono">Sale #{paymentModalSale.id} ({paymentModalSale.date})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900">{paymentModalSale.customer_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Sale Amount:</span>
                <span className="font-mono font-bold text-slate-900">{cur}{paymentModalSale.total_sales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already Paid:</span>
                <span className="font-mono text-emerald-700">{cur}{(paymentModalSale.amount_paid || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-rose-700">Remaining Balance to Pay:</span>
                <span className="font-mono font-bold text-rose-700">{cur}{(paymentModalSale.balance_due || 0).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Payment Amount Received ({cur}) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(paymentModalSale.balance_due || 0))}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    Pay Full Due ({cur}{paymentModalSale.balance_due?.toFixed(2)})
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Date Received *
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
                    Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Reference / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank slip #9842, Cash receipt, etc."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Saving Payment...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Dispatch Product Delivery */}
      {deliveryModalSale && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Dispatch Product Delivery</h3>
              </div>
              <button
                onClick={() => setDeliveryModalSale(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Sale Order:</span>
                <strong className="text-slate-900 font-mono">Sale #{deliveryModalSale.id} ({deliveryModalSale.date})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900">{deliveryModalSale.customer_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Ordered Quantity:</span>
                <span className="font-mono font-bold text-slate-900">{deliveryModalSale.quantity} {unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already Delivered:</span>
                <span className="font-mono text-emerald-700">{deliveryModalSale.delivered_quantity || 0} {unit}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-blue-700">Units Pending Delivery:</span>
                <span className="font-mono font-bold text-blue-700">{deliveryModalSale.pending_quantity || (deliveryModalSale.quantity - (deliveryModalSale.delivered_quantity || 0))} {unit}</span>
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
                    onClick={() => setDeliverQty(String(deliveryModalSale.pending_quantity || (deliveryModalSale.quantity - (deliveryModalSale.delivered_quantity || 0))))}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    Dispatch All Remaining ({deliveryModalSale.pending_quantity || (deliveryModalSale.quantity - (deliveryModalSale.delivered_quantity || 0))} {unit})
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
                  onClick={() => setDeliveryModalSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDelivery}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSubmittingDelivery ? 'Recording Dispatch...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: View Delivery Fulfillment History */}
      {viewHistorySale && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delivery History: Sale #{viewHistorySale.id}</h3>
                  <p className="text-xs text-slate-500">{viewHistorySale.customer_name} • Ordered: {viewHistorySale.quantity} {unit}</p>
                </div>
              </div>
              <button
                onClick={() => setViewHistorySale(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {viewHistorySale.deliveries && viewHistorySale.deliveries.length > 0 ? (
                  viewHistorySale.deliveries.map((del, dIdx) => (
                    <div key={del.id || dIdx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
                          <span>Dispatch #{dIdx + 1} — {del.date}</span>
                          <span className="font-mono text-blue-700 font-bold">({del.quantity} {unit})</span>
                        </div>
                        {del.notes && <p className="text-slate-600">{del.notes}</p>}
                      </div>
                      {del.id && (
                        <button
                          onClick={() => setDeliveryToDelete({ id: del.id!, quantity: del.quantity, saleId: viewHistorySale.id })}
                          className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded flex items-center gap-1 transition-colors"
                          title="Delete this dispatch record"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No delivery logs recorded yet.</p>
                )}
              </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-500">Delivered: </span>
                <strong className="text-emerald-700 font-mono">{viewHistorySale.delivered_quantity || 0} / {viewHistorySale.quantity} {unit}</strong>
              </div>
              <button
                onClick={() => setViewHistorySale(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Add New Customer</h3>
            <p className="text-xs text-slate-500 mb-4">Quickly create a customer to record sales immediately.</p>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Hospitality Group"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 019-2834"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  Create Customer
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
        message={`Are you sure you want to delete Sale #${saleToDelete?.id} for customer "${saleToDelete?.customer_name}"?`}
        warningNotice={`Deleting this sale will restore ${saleToDelete?.quantity} ${unit} back to inventory batches, reverse customer charges, and remove associated delivery/payment references.`}
        confirmText="Delete Sale"
        isDeleting={isDeletingSale}
        onConfirm={handleConfirmDeleteSale}
        onClose={() => setSaleToDelete(null)}
      />

      {/* Delete Delivery Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deliveryToDelete)}
        title="Delete Delivery Record"
        message={`Are you sure you want to delete this dispatch record of ${deliveryToDelete?.quantity} ${unit}?`}
        warningNotice="This will revert the delivered quantity count on the sale and adjust pending delivery units in the customer ledger."
        confirmText="Delete Dispatch"
        isDeleting={isDeletingDelivery}
        onConfirm={handleConfirmDeleteDelivery}
        onClose={() => setDeliveryToDelete(null)}
      />
    </div>
  );
};
