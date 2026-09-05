import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, RotateCcw, CheckCircle2, X, AlertCircle, Trash2, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import { Settings } from '../types';

interface SettingsModalProps {
  settings: Settings;
  isOpen: boolean;
  onClose: () => void;
  onSettingsUpdated: (updated: Settings) => void;
  onDataReset?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSettingsUpdated,
  onDataReset,
}) => {
  const [productName, setProductName] = useState(settings?.product_name || 'Commercial Grade Coffee Beans (1kg Bag)');
  const [currencySymbol, setCurrencySymbol] = useState(settings?.currency_symbol || '$');
  const [unitName, setUnitName] = useState(settings?.unit_name || 'Bags');
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [keepCustomersInWipe, setKeepCustomersInWipe] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && settings) {
      setProductName(settings.product_name || 'Commercial Grade Coffee Beans (1kg Bag)');
      setCurrencySymbol(settings.currency_symbol || '$');
      setUnitName(settings.unit_name || 'Bags');
      setErrorMsg(null);
      setSuccessNotice(null);
      setShowResetConfirm(false);
      setShowWipeConfirm(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const updated: Settings = {
        product_name: productName.trim() || 'Commercial Grade Coffee Beans (1kg Bag)',
        currency_symbol: currencySymbol.trim() || '$',
        unit_name: unitName.trim() || 'Bags',
      };
      await api.updateSettings(updated);
      onSettingsUpdated(updated);
      setSavedNotice(true);
      setTimeout(() => {
        setSavedNotice(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    setErrorMsg(null);
    setSuccessNotice(null);
    try {
      await api.resetData();
      setShowResetConfirm(false);
      setSuccessNotice('Database successfully reset to initial demo sample state!');
      if (onDataReset) {
        onDataReset();
      }
      setTimeout(() => {
        setIsResetting(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset demo data');
      setIsResetting(false);
    }
  };

  const handleWipeData = async () => {
    setIsWiping(true);
    setErrorMsg(null);
    setSuccessNotice(null);
    try {
      await api.wipeData({ keepCustomers: keepCustomersInWipe });
      setShowWipeConfirm(false);
      setSuccessNotice(
        keepCustomersInWipe
          ? 'All transaction history, batches, sales, and ledgers have been cleared. Customers retained.'
          : 'Complete database wipe finished. Clean slate ready for fresh entry.'
      );
      if (onDataReset) {
        onDataReset();
      }
      setTimeout(() => {
        setIsWiping(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to wipe data');
      setIsWiping(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">System Configuration & Data Management</h2>
              <p className="text-[11px] text-slate-500">Business preferences & database controls</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Single Product Name
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                placeholder="e.g. Commercial Grade Coffee Beans (1kg Bag)"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                All batches and transactions revolve around this single item.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Currency Symbol
                </label>
                <input
                  type="text"
                  required
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  placeholder="$ or € or £"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unit of Measurement
                </label>
                <input
                  type="text"
                  required
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  placeholder="e.g. Bags, Kg, Units"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {savedNotice ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
                )}
              </button>
            </div>
          </form>

          {/* Data Reset & Management Section */}
          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-slate-600" />
              <span>Data Management & Reset Operations</span>
            </div>

            {/* Option 1: Clean Slate / Wipe All Data */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    Wipe Business Data (Clean Slate)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Clear all sales transactions, purchases, stock batches, and ledgers to start fresh with zero records.
                  </p>
                </div>
                {!showWipeConfirm && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowWipeConfirm(true);
                      setShowResetConfirm(false);
                    }}
                    className="px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Wipe Data
                  </button>
                )}
              </div>

              {showWipeConfirm && (
                <div className="mt-3 p-3 bg-rose-50/80 border border-rose-200 rounded-lg space-y-3">
                  <p className="text-xs text-rose-900 font-medium">
                    This will permanently clear all transactions, stock batches, delivery records, and item ledgers.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={keepCustomersInWipe}
                      onChange={(e) => setKeepCustomersInWipe(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>Keep customer directory accounts (clears their ledger balances to $0)</span>
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowWipeConfirm(false)}
                      disabled={isWiping}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleWipeData}
                      disabled={isWiping}
                      className="px-3 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors"
                    >
                      {isWiping ? 'Wiping...' : 'Yes, Wipe All Records'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Option 2: Restore Demo Dataset */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                    Restore Sample Demo Data
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Reset and re-populate the database with the initial coffee shop sample batches, sales, and accounts.
                  </p>
                </div>
                {!showResetConfirm && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetConfirm(true);
                      setShowWipeConfirm(false);
                    }}
                    className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Demo
                  </button>
                )}
              </div>

              {showResetConfirm && (
                <div className="mt-3 p-3 bg-blue-50/80 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-xs text-blue-900 font-medium">
                    Are you sure you want to reset all data back to the clean demonstration state? All current batches, sales, and ledgers will be re-seeded.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      disabled={isResetting}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded border border-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResetData}
                      disabled={isResetting}
                      className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                    >
                      {isResetting ? 'Resetting...' : 'Confirm Demo Reset'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
