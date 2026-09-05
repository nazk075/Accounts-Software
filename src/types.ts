export interface Settings {
  product_name: string;
  currency_symbol: string;
  unit_name: string;
}

export interface StockBatch {
  id: number;
  batch_number: string;
  purchase_date: string;
  original_quantity: number;
  remaining_quantity: number;
  sold_quantity: number;
  unit_cost: number;
  remaining_value: number;
  status: 'Active' | 'Exhausted';
  average_selling_price?: number;
  realized_profit?: number;
  total_batch_sales?: number;
  total_batch_cost?: number;
  has_realized_sales?: boolean;
}

export interface Purchase {
  id: number;
  date: string;
  batch_number: string;
  quantity: number;
  unit_purchase_price: number;
  total_amount: number;
  notes?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string;
  created_at: string;
  total_sales: number;
  total_collections: number;
  outstanding_balance: number;
  total_delivered_quantity?: number;
  total_pending_quantity?: number;
  total_delivered_value?: number;
  total_pending_value?: number;
}

export interface CustomerLedgerEntry {
  id: number;
  customer_id: number;
  date: string;
  transaction_type: 'SALE' | 'COLLECTION' | 'DELIVERY';
  reference: string;
  quantity: number;
  rate: number;
  debit: number;
  credit: number;
  balance: number;
  delivered_quantity?: number;
  pending_units?: number;
}

export interface SaleBatchDetail {
  sale_id?: number;
  batch_id: number;
  batch_number: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  total_sales?: number;
  profit?: number;
  margin_percent?: number;
}

export interface SaleDelivery {
  id: number;
  sale_id: number;
  date: string;
  quantity: number;
  notes?: string;
}

export interface Sale {
  id: number;
  date: string;
  customer_id: number;
  customer_name: string;
  quantity: number;
  selling_price: number;
  total_sales: number;
  total_cost: number;
  profit: number;
  profit_margin?: number;
  amount_paid?: number;
  balance_due?: number;
  payment_status?: 'PAID' | 'PARTIAL' | 'UNPAID';
  delivered_quantity?: number;
  pending_quantity?: number;
  delivery_status?: 'DELIVERED' | 'PARTIAL' | 'PENDING';
  deliveries?: SaleDelivery[];
  batchDetails?: SaleBatchDetail[];
}

export interface Collection {
  id: number;
  customer_id: number;
  customer_name: string;
  date: string;
  amount: number;
  payment_method: string;
  notes?: string;
}

export interface ItemLedgerEntry {
  id: number;
  date: string;
  transaction_type: 'PURCHASE' | 'SALE';
  reference: string;
  batch_id?: number;
  batch_number?: string;
  unit_cost?: number;
  stock_in: number;
  stock_out: number;
  running_balance: number;
}

export interface DashboardData {
  totalStockAvailable: number;
  totalStockValue: number;
  activeBatchesCount: number;
  totalSales: number;
  totalProfit: number;
  totalCustomerOutstanding: number;
  todayCollection: number;
  totalOrderedUnits?: number;
  totalDeliveredUnits?: number;
  totalDeliveredValue?: number;
  totalPendingDeliveries?: number;
  totalPendingValue?: number;
  averagePurchaseCost: number;
  averageSellingPrice: number;
  recentPurchases: Purchase[];
  recentSales: Sale[];
  recentCollections: Collection[];
}

export interface StockBalanceReportData {
  summary: {
    openingStock: number;
    totalPurchased: number;
    totalSold: number;
    closingStock: number;
    totalStockValue: number;
    averagePurchaseCost: number;
  };
  batches: {
    id: number;
    batch_number: string;
    purchase_date: string;
    purchased_qty: number;
    sold_qty: number;
    remaining_qty: number;
    unit_cost: number;
    remaining_value: number;
  }[];
}

export interface ProfitReportData {
  summary: {
    totalSales: number;
    totalPurchaseCost: number;
    totalProfit: number;
    overallMarginPercent: number;
    totalQuantitySold: number;
    averageSellingPrice: number;
    averagePurchaseCost?: number;
  };
  sales: {
    id: number;
    date: string;
    customer_id: number;
    customer_name: string;
    quantity: number;
    selling_price: number;
    total_sales: number;
    total_cost: number;
    profit: number;
    margin_percent: number;
    batchesUsed: string;
    batchDetails?: SaleBatchDetail[];
  }[];
}

export type ActiveTab = 
  | 'dashboard'
  | 'purchase-entry'
  | 'batch-inventory'
  | 'sales-entry'
  | 'customers'
  | 'customer-detail'
  | 'daily-collection'
  | 'item-ledger'
  | 'stock-report'
  | 'profit-report';

export type ActiveView = ActiveTab;

export type StockReportResponse = {
  openingStock: number;
  totalPurchased: number;
  totalSold: number;
  closingStock: number;
  totalStockValue: number;
  averagePurchaseCost: number;
  batchReports: {
    id: number;
    batch_number: string;
    purchase_date: string;
    original_quantity: number;
    sold_quantity: number;
    remaining_quantity: number;
    unit_cost: number;
    remaining_value: number;
    status: string;
  }[];
};

export type ProfitReportResponse = {
  summary: {
    totalSales: number;
    totalPurchaseCost: number;
    totalProfit: number;
    overallMarginPercent: number;
    totalQuantitySold: number;
    averageSellingPrice: number;
  };
  items: {
    id: number;
    date: string;
    customer_id: number;
    customer_name: string;
    quantity: number;
    selling_price: number;
    sales_amount: number;
    purchase_cost: number;
    profit: number;
    margin_percent: number;
    batchBreakdown: {
      batch_id: number;
      batch_number: string;
      quantity: number;
      unit_cost: number;
    }[];
  }[];
};

