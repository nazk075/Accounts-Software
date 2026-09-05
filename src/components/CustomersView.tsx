import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  ArrowUpRight,
  CreditCard,
  Wallet,
  Phone,
  MapPin,
  RefreshCw,
  FileText,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api';
import { Customer, Settings } from '../types';
import { exportCustomersSummaryCsv, exportAllCustomerSalesCsv } from '../utils/csvExport';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface CustomersViewProps {
  settings: Settings;
  onOpenCustomerAccount: (customerId: number) => void;
  onNavigateToCollection: () => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  settings,
  onOpenCustomerAccount,
  onNavigateToCollection,
}) => {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });
  const [modalError, setModalError] = useState('');

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleExportSummary = () => {
    exportCustomersSummaryCsv(filteredCustomers.length > 0 ? filteredCustomers : customers, settings);
  };

  const handleExportAllSales = async () => {
    try {
      const sales = await api.getSales();
      exportAllCustomerSalesCsv(sales, customers, settings);
    } catch (err: any) {
      alert('Failed to export customer sales: ' + (err.message || err));
    }
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', address: '' });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(c);
    setFormData({ name: c.name, phone: c.phone || '', address: c.address || '' });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!formData.name.trim()) {
      setModalError('Customer name is required');
      return;
    }

    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, formData);
      } else {
        await api.createCustomer(formData);
      }
      setIsModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save customer');
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    setFeedbackMsg(null);
    try {
      const res = await api.deleteCustomer(customerToDelete.id);
      setFeedbackMsg({
        type: 'success',
        text: res.message || `Customer "${customerToDelete.name}" deleted successfully.`,
      });
      setCustomerToDelete(null);
      await loadCustomers();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to delete customer.',
      });
      setCustomerToDelete(null);
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'due' | 'pending'>('all');

  const filteredCustomers = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.toLowerCase().includes(term)) ||
      (c.address && c.address.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (activeFilterTab === 'due') {
      return c.outstanding_balance > 0;
    }
    if (activeFilterTab === 'pending') {
      return (c.total_pending_quantity || 0) > 0;
    }
    return true;
  });

  const totalOutstandingAll = customers.reduce((acc, c) => acc + c.outstanding_balance, 0);
  const totalSalesAll = customers.reduce((acc, c) => acc + c.total_sales, 0);
  const totalCollectedAll = customers.reduce((acc, c) => acc + c.total_collections, 0);
  const totalPendingUnitsAll = customers.reduce((acc, c) => acc + (c.total_pending_quantity || 0), 0);
  const countWithDue = customers.filter((c) => c.outstanding_balance > 0).length;
  const countWithPending = customers.filter((c) => (c.total_pending_quantity || 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Header & Compact Corner Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Customer Accounts Directory</h2>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full border border-slate-200">
              {customers.length} Accounts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual ledgers, balances to pay, delivery fulfillment, and contact profiles
          </p>
        </div>

        {/* Small Corner Summary Metrics (Compact & space-saving) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Total Invoiced Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/90 text-slate-800 rounded-lg text-xs border border-slate-200 shadow-2xs" title="Total Invoiced across all customers">
            <span className="text-slate-500 font-medium">Invoiced:</span>
            <span className="font-bold font-mono text-slate-900">
              {cur}{totalSalesAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Total Collections Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 rounded-lg text-xs border border-teal-200 shadow-2xs" title="Total Payments Received">
            <span className="text-teal-600 font-medium">Collected:</span>
            <span className="font-bold font-mono text-teal-800">
              {cur}{totalCollectedAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Total Outstanding Balance Pill (Highlighted) */}
          <div
            onClick={() => setActiveFilterTab('due')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border shadow-2xs cursor-pointer transition-all ${
              totalOutstandingAll > 0
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 font-bold'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Total unpaid balance across all customers (Click to filter)"
          >
            <span className={totalOutstandingAll > 0 ? 'text-rose-700 font-medium' : 'text-slate-500 font-medium'}>
              Balance to Pay:
            </span>
            <span className="font-mono text-rose-800 font-bold">
              {cur}{totalOutstandingAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {countWithDue > 0 && (
              <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded-full font-mono">
                {countWithDue}
              </span>
            )}
          </div>

          {/* Total Pending Fulfillment Pill */}
          <div
            onClick={() => setActiveFilterTab('pending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border shadow-2xs cursor-pointer transition-all ${
              totalPendingUnitsAll > 0
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 font-bold'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Total units sold awaiting delivery (Click to filter)"
          >
            <span className={totalPendingUnitsAll > 0 ? 'text-amber-700 font-medium' : 'text-slate-500 font-medium'}>
              To Deliver:
            </span>
            <span className="font-mono text-amber-900 font-bold">
              {totalPendingUnitsAll.toLocaleString()} {unit}
            </span>
            {countWithPending > 0 && (
              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full font-mono">
                {countWithPending}
              </span>
            )}
          </div>

          {/* Quick Buttons */}
          <button
            id="btn-add-customer"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Add Customer</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Controls Bar: Search, Quick Filter Tabs, CSV Exports */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeFilterTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Customers ({customers.length})
          </button>
          <button
            onClick={() => setActiveFilterTab('due')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeFilterTab === 'due'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span>With Balance Due</span>
            <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
              activeFilterTab === 'due' ? 'bg-rose-800 text-white' : 'bg-rose-200 text-rose-800'
            }`}>
              {countWithDue}
            </span>
          </button>
          <button
            onClick={() => setActiveFilterTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeFilterTab === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>Pending Delivery</span>
            <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
              activeFilterTab === 'pending' ? 'bg-amber-800 text-white' : 'bg-amber-200 text-amber-900'
            }`}>
              {countWithPending}
            </span>
          </button>
        </div>

        {/* Search & Export */}
        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              id="customer-search-input"
              placeholder="Search by name, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            id="btn-export-customers-summary"
            onClick={handleExportSummary}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-2xs transition-colors whitespace-nowrap"
            title="Export customer balances to CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>

          <button
            id="btn-export-all-sellings"
            onClick={handleExportAllSales}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-2xs transition-colors whitespace-nowrap"
            title="Export all itemized customer sales"
          >
            <Download className="w-3.5 h-3.5 text-amber-600" />
            <span>Sales CSV</span>
          </button>

          <button
            onClick={loadCustomers}
            disabled={isLoading}
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* CUSTOMERS TABLE (Excel Sheet Layout) */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-hidden">
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
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 bg-slate-50">
                    <p className="font-semibold text-slate-600">No customers found matching current filters.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try clearing your search or click "+ Add Customer" above.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => {
                  const hasDue = c.outstanding_balance > 0;
                  const delivered = c.total_delivered_quantity || 0;
                  const pending = c.total_pending_quantity || 0;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onOpenCustomerAccount(c.id)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer even:bg-slate-50/40"
                    >
                      {/* Customer Name */}
                      <td className="px-3.5 py-2 border-r border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 hover:text-blue-700">
                            {c.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
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
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onOpenCustomerAccount(c.id)}
                            className="px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50 rounded border border-slate-300 font-medium transition-colors"
                            title="Statement"
                          >
                            Statement
                          </button>

                          {hasDue && (
                            <button
                              onClick={() => onNavigateToCollection()}
                              className="px-2 py-0.5 text-xs text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-300 font-medium transition-colors"
                              title="Record payment"
                            >
                              + Pay
                            </button>
                          )}

                          <button
                            onClick={(e) => handleOpenEdit(c, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomerToDelete(c);
                            }}
                            className="p-1 text-rose-400 hover:text-rose-600 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
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

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter customer details. An individual ledger will be maintained automatically.
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Blue Sky Bistro"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 345-6789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Address
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 88 Main Street, Suite 4B"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Customer Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(customerToDelete)}
        title={`Delete Customer "${customerToDelete?.name}"`}
        message={`Are you sure you want to delete customer "${customerToDelete?.name}"?`}
        warningNotice="Note: If this customer has existing sales or transactions, remove or reassign those first."
        confirmText="Delete Customer"
        isDeleting={isDeletingCustomer}
        onConfirm={handleConfirmDeleteCustomer}
        onClose={() => setCustomerToDelete(null)}
      />
    </div>
  );
};
