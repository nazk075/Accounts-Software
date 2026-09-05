import {
  Settings,
  DashboardData,
  StockBatch,
  Purchase,
  Customer,
  CustomerLedgerEntry,
  Sale,
  Collection,
  ItemLedgerEntry,
  StockBalanceReportData,
  ProfitReportData,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }
  return json.data !== undefined ? json.data : json;
}

export const api = {
  // Settings
  getSettings: async (): Promise<Settings> => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json && json.settings) {
        return json.settings;
      }
      if (json && json.data && json.data.settings) {
        return json.data.settings;
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
    return {
      product_name: 'Commercial Grade Coffee Beans (1kg Bag)',
      currency_symbol: '$',
      unit_name: 'Bags',
    };
  },
  updateSettings: async (settings: Partial<Settings>): Promise<Settings> => {
    await request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    const current = await api.getSettings();
    return {
      ...current,
      ...settings,
    };
  },
  resetData: async (): Promise<void> => {
    await request('/api/reset-data', { method: 'POST' });
  },
  wipeData: async (options?: { keepCustomers?: boolean }): Promise<void> => {
    await request('/api/wipe-data', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  // Dashboard
  getDashboard: async (): Promise<DashboardData> => {
    return request<DashboardData>('/api/dashboard');
  },

  // Batches
  getBatches: async (): Promise<{ batches: StockBatch[]; nextBatchNumber: string; summary: any }> => {
    return request<{ batches: StockBatch[]; nextBatchNumber: string; summary: any }>('/api/batches');
  },
  deleteBatch: async (id: number): Promise<any> => {
    return request(`/api/batches/${id}`, { method: 'DELETE' });
  },

  // Purchases
  getPurchases: async (): Promise<any[]> => {
    return request<any[]>('/api/purchases');
  },
  createPurchase: async (data: {
    date: string;
    batch_number?: string;
    quantity: number;
    unit_purchase_price: number;
    notes?: string;
  }): Promise<{ message: string; data: any }> => {
    return request('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  deletePurchase: async (id: number): Promise<any> => {
    return request(`/api/purchases/${id}`, { method: 'DELETE' });
  },

  // Customers
  getCustomers: async (): Promise<Customer[]> => {
    return request<Customer[]>('/api/customers');
  },
  createCustomer: async (data: { name: string; phone?: string; address?: string }): Promise<any> => {
    return request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateCustomer: async (id: number, data: { name: string; phone?: string; address?: string }): Promise<any> => {
    return request(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteCustomer: async (id: number): Promise<any> => {
    return request(`/api/customers/${id}`, { method: 'DELETE' });
  },
  getCustomerLedger: async (
    id: number,
    params?: { startDate?: string; endDate?: string }
  ): Promise<{
    customer: Customer;
    summary: {
      totalSales: number;
      totalCollections: number;
      outstandingBalance: number;
      totalDeliveredValue?: number;
      totalPendingValue?: number;
      totalOrderedUnits?: number;
      totalDeliveredUnits?: number;
      totalPendingUnits?: number;
    };
    sales: Sale[];
    ledger: CustomerLedgerEntry[];
  }> => {
    const query = new URLSearchParams();
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    return request(`/api/customers/${id}/ledger?${query.toString()}`);
  },

  // Sales
  getSales: async (): Promise<Sale[]> => {
    return request<Sale[]>('/api/sales');
  },
  createSales: async (
    sales: {
      date: string;
      customer_id: number;
      quantity: number;
      selling_price: number;
      batches: { batch_id: number; quantity: number }[];
      amount_paid?: number;
      payment_method?: string;
      payment_notes?: string;
      delivered_quantity?: number;
      delivery_notes?: string;
    }[]
  ): Promise<{ message: string; data: any }> => {
    return request('/api/sales', {
      method: 'POST',
      body: JSON.stringify({ sales }),
    });
  },
  recordSalePayment: async (
    saleId: number,
    data: {
      amount: number;
      date?: string;
      payment_method?: string;
      notes?: string;
    }
  ): Promise<{ message: string; data: any }> => {
    return request(`/api/sales/${saleId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  recordSaleDelivery: async (
    saleId: number,
    data: {
      quantity: number;
      date?: string;
      notes?: string;
    }
  ): Promise<{ message: string; data: any }> => {
    return request(`/api/sales/${saleId}/deliveries`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  deleteSale: async (saleId: number): Promise<any> => {
    return request(`/api/sales/${saleId}`, { method: 'DELETE' });
  },
  deleteDelivery: async (deliveryId: number): Promise<any> => {
    return request(`/api/deliveries/${deliveryId}`, { method: 'DELETE' });
  },

  // Collections
  getCollections: async (): Promise<Collection[]> => {
    return request<Collection[]>('/api/collections');
  },
  createCollections: async (
    collections: {
      customer_id: number;
      date: string;
      amount: number;
      payment_method: string;
      notes?: string;
    }[]
  ): Promise<{ message: string; data: any }> => {
    return request('/api/collections', {
      method: 'POST',
      body: JSON.stringify({ collections }),
    });
  },
  deleteCollection: async (collectionId: number): Promise<any> => {
    return request(`/api/collections/${collectionId}`, { method: 'DELETE' });
  },

  // Item Ledger
  getItemLedger: async (params?: {
    startDate?: string;
    endDate?: string;
    type?: string;
    batch_id?: string;
  }): Promise<{
    entries: ItemLedgerEntry[];
    summary: { totalStockIn: number; totalStockOut: number; currentStock: number };
  }> => {
    const query = new URLSearchParams();
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.type) query.append('type', params.type);
    if (params?.batch_id) query.append('batch_id', params.batch_id);
    return request(`/api/item-ledger?${query.toString()}`);
  },

  // Reports
  getStockBalanceReport: async (params?: {
    startDate?: string;
    endDate?: string;
    batch_id?: string;
  }): Promise<StockBalanceReportData> => {
    const query = new URLSearchParams();
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.batch_id) query.append('batch_id', params.batch_id);
    return request<StockBalanceReportData>(`/api/reports/stock-balance?${query.toString()}`);
  },

  getProfitReport: async (params?: {
    filterType?: string;
    startDate?: string;
    endDate?: string;
    customerId?: string;
  }): Promise<ProfitReportData> => {
    const query = new URLSearchParams();
    if (params?.filterType) query.append('filterType', params.filterType);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.customerId) query.append('customerId', params.customerId);
    return request<ProfitReportData>(`/api/reports/profit?${query.toString()}`);
  },
};
