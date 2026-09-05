import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Download,
  UserPlus,
  X,
  PackageCheck,
  Clock,
} from 'lucide-react';
import { api } from '../api';
import { Customer, Settings, Collection } from '../types';
import { exportCollectionsCsv } from '../utils/csvExport';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface CollectionRowForm {
  id: string;
  date: string;
  customer_id: number;
  amount: number;
  payment_method: string;
  notes: string;
}

interface DailyCollectionEntryViewProps {
  settings: Settings;
  onCollectionsSaved: () => void;
  onNavigateToCustomer: (customerId: number) => void;
}

export const DailyCollectionEntryView: React.FC<DailyCollectionEntryViewProps> = ({
  settings,
  onCollectionsSaved,
  onNavigateToCustomer,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const today = new Date().toISOString().split('T')[0];

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentCollections, setRecentCollections] = useState<Collection[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);

  // Quick Customer Creation Modal State
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [targetRowIdForNewCustomer, setTargetRowIdForNewCustomer] = useState<string | null>(null);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', address: '' });
  const [newCustomerSubmitting, setNewCustomerSubmitting] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  const createEmptyRow = (): CollectionRowForm => ({
    id: Math.random().toString(36).substring(2, 9),
    date: today,
    customer_id: 0,
    amount: 0,
    payment_method: 'Cash',
    notes: '',
  });

  const [rows, setRows] = useState<CollectionRowForm[]>([createEmptyRow()]);

  const loadData = async () => {
    try {
      const [custList, colList] = await Promise.all([
        api.getCustomers(),
        api.getCollections(),
      ]);
      setCustomers(custList);
      setRecentCollections(colList.slice(0, 15));
    } catch (err) {
      console.error('Failed to load collections data:', err);
    }
  };

  const handleExportCollections = async () => {
    try {
      const allCols = await api.getCollections();
      exportCollectionsCsv(allCols.length > 0 ? allCols : recentCollections, settings);
    } catch {
      exportCollectionsCsv(recentCollections, settings);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRow = () => {
    // Default the new row to the date of the previous row for convenience
    const lastDate = rows[rows.length - 1]?.date || today;
    setRows((prev) => [...prev, { ...createEmptyRow(), date: lastDate }]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) {
      // Clear instead of removing last remaining row
      setRows([createEmptyRow()]);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, updates: Partial<CollectionRowForm>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const openQuickAddCustomer = (rowId: string | null) => {
    setTargetRowIdForNewCustomer(rowId);
    setNewCustomerForm({ name: '', phone: '', address: '' });
    setNewCustomerError(null);
    setIsQuickCustomerModalOpen(true);
  };

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim()) {
      setNewCustomerError('Customer name is required.');
      return;
    }
    setNewCustomerSubmitting(true);
    setNewCustomerError(null);
    try {
      const res = await api.createCustomer({
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim(),
        address: newCustomerForm.address.trim(),
      });
      const newCustId = res.data?.id || res.id;
      const updatedCustList = await api.getCustomers();
      setCustomers(updatedCustList);

      // If opened for a specific row, assign the new customer to that row
      if (targetRowIdForNewCustomer && newCustId) {
        updateRow(targetRowIdForNewCustomer, { customer_id: newCustId });
      } else if (newCustId) {
        setRows((prev) =>
          prev.map((r, i) => (i === 0 && r.customer_id === 0 ? { ...r, customer_id: newCustId } : r))
        );
      }

      setIsQuickCustomerModalOpen(false);
      setStatusMessage({
        type: 'success',
        text: `Customer "${newCustomerForm.name.trim()}" added successfully and selected.`,
      });
    } catch (err: any) {
      setNewCustomerError(err.message || 'Failed to create customer.');
    } finally {
      setNewCustomerSubmitting(false);
    }
  };

  const grandTotal = rows.reduce((acc, r) => acc + (r.amount || 0), 0);
  const totalPendingUnitsAll = customers.reduce((acc, c) => acc + (c.total_pending_quantity || 0), 0);
  const totalOutstandingAll = customers.reduce((acc, c) => acc + (c.outstanding_balance || 0), 0);
  const todayTotalCollected = recentCollections
    .filter((c) => c.date === today)
    .reduce((acc, c) => acc + c.amount, 0);

  const handleSaveAll = async () => {
    setStatusMessage(null);

    // Filter rows that have a customer selected
    const validRows = rows.filter((r) => r.customer_id > 0);

    if (validRows.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please select a customer for at least one collection row.' });
      return;
    }

    // Validation
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const prefix = validRows.length > 1 ? `Row ${i + 1}: ` : '';

      if (!r.amount || r.amount <= 0) {
        setStatusMessage({ type: 'error', text: `${prefix}Please enter a valid amount to collect.` });
        return;
      }
      if (!r.date) {
        setStatusMessage({ type: 'error', text: `${prefix}Please specify the collection date.` });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = validRows.map((r) => ({
        customer_id: r.customer_id,
        date: r.date,
        amount: r.amount,
        payment_method: r.payment_method,
        notes: r.notes.trim(),
      }));

      const res = await api.createCollections(payload);
      setStatusMessage({
        type: 'success',
        text: res.message || 'All collections recorded successfully! Customer accounts have been credited.',
      });

      setRows([createEmptyRow()]);
      await loadData();
      onCollectionsSaved();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save collections.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteCollection = async () => {
    if (!collectionToDelete) return;
    setIsDeletingCollection(true);
    try {
      const res = await api.deleteCollection(collectionToDelete.id);
      setStatusMessage({
        type: 'success',
        text: res.message || `Payment receipt #${collectionToDelete.id} deleted successfully. Customer balance adjusted.`,
      });
      setCollectionToDelete(null);
      await loadData();
      onCollectionsSaved();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to delete collection receipt.',
      });
    } finally {
      setIsDeletingCollection(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Quick Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Daily Customer Collections</h2>
          <p className="text-xs text-slate-500">
            Record customer payment receipts directly in a single row per entry. Automatic balance adjustments.
          </p>
        </div>

        {/* Top Summary Metrics */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Total Due Across All</span>
            <span className="font-bold text-rose-700">{cur}{totalOutstandingAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Pending Delivery Units</span>
            <span className="font-bold text-amber-800">{totalPendingUnitsAll.toLocaleString()} {unit}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Collected Today</span>
            <span className="font-bold text-teal-700">{cur}{todayTotalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-md text-xs flex items-center gap-2 border ${
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

      {/* SINGLE-ROW EXCEL SPREADSHEET ENTRY TABLE */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 bg-slate-100/80 border-b border-slate-300 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Receive Payments (Single Row Entry)
          </span>
          <button
            type="button"
            onClick={() => openQuickAddCustomer(null)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-300 rounded shadow-2xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Add New Customer</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
              <tr>
                <th className="px-2.5 py-2 text-center w-10 border-r border-slate-200">#</th>
                <th className="px-3 py-2 border-r border-slate-200 w-36">Date</th>
                <th className="px-3 py-2 border-r border-slate-200 min-w-[240px]">
                  Customer Name
                </th>
                <th className="px-3 py-2 text-right border-r border-slate-200 w-28">Current Due</th>
                <th className="px-3 py-2 text-right border-r border-slate-200 w-36">Amount Received</th>
                <th className="px-3 py-2 text-right border-r border-slate-200 w-36">Balance to Take / Give</th>
                <th className="px-3 py-2 border-r border-slate-200 w-32">Payment Method</th>
                <th className="px-3 py-2 border-r border-slate-200">Notes / Ref</th>
                <th className="px-2.5 py-2 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row, index) => {
                const selectedCust = customers.find((c) => c.id === row.customer_id);
                const due = selectedCust ? selectedCust.outstanding_balance : 0;
                const diff = due - (row.amount || 0);

                return (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors even:bg-slate-50/40">
                    {/* Index */}
                    <td className="px-2.5 py-1.5 text-center font-mono text-slate-400 border-r border-slate-200">
                      {index + 1}
                    </td>

                    {/* Date */}
                    <td className="px-2 py-1.5 border-r border-slate-200">
                      <input
                        type="date"
                        required
                        value={row.date}
                        onChange={(e) => updateRow(row.id, { date: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                      />
                    </td>

                    {/* Customer Selection with Quick Add Option */}
                    <td className="px-2 py-1.5 border-r border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={row.customer_id}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              openQuickAddCustomer(row.id);
                            } else {
                              updateRow(row.id, { customer_id: parseInt(e.target.value, 10) });
                            }
                          }}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-medium text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                        >
                          <option value={0}>-- Select Customer --</option>
                          <option value="__new__" className="font-bold text-blue-700 bg-blue-50">
                            + Add New Customer...
                          </option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.outstanding_balance > 0 ? `(Due: ${cur}${c.outstanding_balance.toFixed(2)})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => openQuickAddCustomer(row.id)}
                          className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-blue-700 border border-slate-300 rounded whitespace-nowrap transition-colors"
                          title="Click to add a new customer not in this list"
                        >
                          + New
                        </button>
                      </div>
                    </td>

                    {/* Current Due */}
                    <td className="px-3 py-1.5 text-right border-r border-slate-200 font-mono">
                      {selectedCust ? (
                        <span className={selectedCust.outstanding_balance > 0 ? 'text-rose-700 font-semibold' : 'text-slate-500'}>
                          {cur}{selectedCust.outstanding_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Amount Received Input */}
                    <td className="px-2 py-1.5 border-r border-slate-200">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={row.amount || ''}
                          onChange={(e) => updateRow(row.id, { amount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 text-xs text-right font-mono font-bold border border-slate-300 rounded bg-white text-teal-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                    </td>

                    {/* Balance to Take / Give */}
                    <td className="px-3 py-1.5 text-right border-r border-slate-200 font-mono">
                      {selectedCust ? (
                        diff > 0 ? (
                          <span className="text-rose-700 font-semibold" title="Remaining balance to take from customer">
                            Take {cur}{diff.toFixed(2)}
                          </span>
                        ) : diff === 0 ? (
                          <span className="text-emerald-700 font-bold" title="Balance settled">
                            Clear ({cur}0.00)
                          </span>
                        ) : (
                          <span className="text-blue-700 font-semibold" title="Overpayment / Credit / Give back">
                            Give {cur}{Math.abs(diff).toFixed(2)}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Method */}
                    <td className="px-2 py-1.5 border-r border-slate-200">
                      <select
                        value={row.payment_method}
                        onChange={(e) => updateRow(row.id, { payment_method: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cheque">Cheque</option>
                        <option value="UPI / Online">UPI / Online</option>
                      </select>
                    </td>

                    {/* Notes */}
                    <td className="px-2 py-1.5 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="Ref # / Notes (optional)"
                        value={row.notes}
                        onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                      />
                    </td>

                    {/* Action */}
                    <td className="px-2.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remove row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer Controls */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 rounded border border-slate-300 shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Person / Row</span>
            </button>
            <button
              type="button"
              onClick={() => openQuickAddCustomer(null)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-blue-700 rounded border border-slate-300 shadow-2xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ New Customer</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-xs">
              <span className="text-slate-500">Total to Collect: </span>
              <strong className="text-sm font-bold font-mono text-teal-700">
                {cur}{grandTotal.toFixed(2)}
              </strong>
            </div>

            <button
              type="button"
              disabled={isSubmitting || grandTotal <= 0}
              onClick={handleSaveAll}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold shadow-2xs transition-colors disabled:opacity-50"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Posting...' : 'Save & Post Collections'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* RECENT RECORDED COLLECTIONS (Excel Sheet Layout) */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 bg-slate-100/80 border-b border-slate-300 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Recent Collection Records
          </span>
          <button
            onClick={handleExportCollections}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs transition-colors"
            title="Export daily receipts and customer payments to CSV"
          >
            <Download className="w-3.5 h-3.5 text-teal-600" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
              <tr>
                <th className="px-3 py-2 border-r border-slate-200">Receipt Ref</th>
                <th className="px-3 py-2 border-r border-slate-200">Date</th>
                <th className="px-3 py-2 border-r border-slate-200">Customer</th>
                <th className="px-3 py-2 text-center border-r border-slate-200">Pending Units Record</th>
                <th className="px-3 py-2 border-r border-slate-200">Method</th>
                <th className="px-3 py-2 border-r border-slate-200">Notes</th>
                <th className="px-3 py-2 text-right border-r border-slate-200">Amount Received</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {recentCollections.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 bg-slate-50">
                    No payment collections recorded yet.
                  </td>
                </tr>
              ) : (
                recentCollections.map((col) => {
                  const cust = customers.find((c) => c.id === col.customer_id);
                  const pendingUnits = cust?.total_pending_quantity || 0;

                  return (
                    <tr key={col.id} className="hover:bg-blue-50/40 transition-colors even:bg-slate-50/40">
                      <td className="px-3 py-2 font-mono text-slate-500 border-r border-slate-200">
                        #{col.id}
                      </td>
                      <td className="px-3 py-2 text-slate-600 border-r border-slate-200 font-mono">
                        {col.date}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900 border-r border-slate-200">
                        <button
                          onClick={() => onNavigateToCustomer(col.customer_id)}
                          className="hover:text-blue-700 hover:underline"
                        >
                          {col.customer_name}
                        </button>
                      </td>

                      {/* Pending Units Record */}
                      <td className="px-3 py-2 text-center border-r border-slate-200">
                        {pendingUnits > 0 ? (
                          <span className="text-amber-800 font-medium">
                            {pendingUnits.toLocaleString()} {unit} Pending
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            Fulfilled
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                        {col.payment_method}
                      </td>
                      <td className="px-3 py-2 text-slate-500 truncate max-w-xs border-r border-slate-200">
                        {col.notes || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-teal-800 border-r border-slate-200">
                        +{cur}{col.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => setCollectionToDelete(col)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete collection receipt"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* QUICK ADD CUSTOMER MODAL */}
      {isQuickCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 border border-slate-300">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Add New Customer</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Add the customer details. Once saved, this customer will be automatically selected in your collection row.
            </p>

            {newCustomerError && (
              <div className="mb-3 p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {newCustomerError}
              </div>
            )}

            <form onSubmit={handleQuickCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  placeholder="e.g. Acme Cafe & Bakery"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone / Contact (Optional)
                </label>
                <input
                  type="text"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address / Location (Optional)
                </label>
                <input
                  type="text"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                  placeholder="e.g. 104 Main St, Suite 4"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickCustomerModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newCustomerSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded shadow-2xs disabled:opacity-50"
                >
                  {newCustomerSubmitting ? 'Saving...' : 'Save & Select Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Collection Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(collectionToDelete)}
        title={`Delete Payment Receipt #${collectionToDelete?.id}`}
        message={`Are you sure you want to delete payment receipt #${collectionToDelete?.id} of ${cur}${collectionToDelete?.amount?.toFixed(2)} from ${collectionToDelete?.customer_name}?`}
        warningNotice="This will remove the credit from the customer's ledger and restore their outstanding balance to pay."
        confirmText="Delete Payment Receipt"
        isDeleting={isDeletingCollection}
        onConfirm={handleConfirmDeleteCollection}
        onClose={() => setCollectionToDelete(null)}
      />
    </div>
  );
};
