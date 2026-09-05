import {
  Sale,
  StockBatch,
  Customer,
  CustomerLedgerEntry,
  Collection,
  ItemLedgerEntry,
  StockBalanceReportData,
  ProfitReportData,
  Settings,
} from '../types';

/**
 * Escapes a single CSV field following RFC 4180 rules.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Triggers a browser download of a CSV file with proper UTF-8 BOM encoding for Excel/Sheets compatibility.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csvContent = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map(escapeCsvField).join(',')),
  ].join('\r\n');

  // \uFEFF is UTF-8 Byte Order Mark (BOM) ensuring Excel displays unicode symbols ($ / € / £ / ₹) properly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const formatDateStamp = () => new Date().toISOString().split('T')[0];

/**
 * Export complete sales orders and fulfillment history into CSV.
 */
export function exportSalesCsv(sales: Sale[], settings: Settings, customFilename?: string): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  const headers = [
    'Sale ID',
    'Invoice Date',
    'Customer ID',
    'Customer Name',
    'Product Description',
    `Quantity Ordered (${unit})`,
    `Unit Selling Price (${cur})`,
    `Total Invoiced Sales (${cur})`,
    `FIFO Cost of Goods (${cur})`,
    `Realized Gross Profit (${cur})`,
    'Gross Margin (%)',
    `Amount Paid (${cur})`,
    `Outstanding Balance Due (${cur})`,
    'Payment Status',
    `Delivered Quantity (${unit})`,
    `Pending Delivery (${unit})`,
    'Delivery Status',
    'Batches Used (FIFO Details)',
    'Logged Dispatches Count',
  ];

  const rows = sales.map((s) => {
    const delivered = s.delivered_quantity || 0;
    const pending = s.pending_quantity !== undefined ? s.pending_quantity : Math.max(0, s.quantity - delivered);
    const paid = s.amount_paid || 0;
    const balance = s.balance_due !== undefined ? s.balance_due : Math.max(0, s.total_sales - paid);
    const paymentStatus = s.payment_status || (balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID');
    const deliveryStatus = s.delivery_status || (pending <= 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIAL' : 'PENDING');
    const marginPct = s.total_sales > 0 ? ((s.profit / s.total_sales) * 100).toFixed(1) : '0.0';

    const batchBreakdown = s.batchDetails
      ? s.batchDetails
          .map((b) => `${b.batch_number}: ${b.quantity} ${unit} @ ${cur}${Number(b.unit_cost).toFixed(2)}`)
          .join('; ')
      : '';

    return [
      `#${s.id}`,
      s.date,
      s.customer_id,
      s.customer_name,
      prod,
      s.quantity,
      s.selling_price.toFixed(2),
      s.total_sales.toFixed(2),
      s.total_cost.toFixed(2),
      s.profit.toFixed(2),
      `${marginPct}%`,
      paid.toFixed(2),
      balance.toFixed(2),
      paymentStatus,
      delivered,
      pending,
      deliveryStatus,
      batchBreakdown,
      s.deliveries?.length || 0,
    ];
  });

  const filename = customFilename || `sales_detailed_report_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export purchase batch entries and inventory receipt details into CSV.
 */
export function exportPurchasesCsv(purchases: any[], settings: Settings, customFilename?: string): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  const headers = [
    'Purchase ID',
    'Batch Number',
    'Purchase Date',
    'Product Description',
    `Purchased Quantity (${unit})`,
    `Unit Purchase Price (${cur})`,
    `Total Purchase Cost (${cur})`,
    `Remaining in Stock (${unit})`,
    `Units Sold (${unit})`,
    'Stock Status',
    'Purchase Notes',
  ];

  const rows = purchases.map((p) => {
    const qty = p.quantity || p.original_quantity || 0;
    const price = p.unit_purchase_price || p.unit_cost || 0;
    const total = p.total_amount || (qty * price);
    const rem = p.remaining_quantity !== undefined ? p.remaining_quantity : qty;
    const sold = Math.max(0, qty - rem);
    const status = p.status || (rem > 0 ? 'Active' : 'Exhausted');

    return [
      `#${p.id || ''}`,
      p.batch_number || '',
      p.date || p.purchase_date || '',
      prod,
      qty,
      price.toFixed(2),
      total.toFixed(2),
      rem,
      sold,
      status,
      p.notes || '',
    ];
  });

  const filename = customFilename || `purchases_report_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export stock batches with FIFO remaining values and profit realization into CSV.
 */
export function exportBatchesCsv(batches: StockBatch[], settings: Settings, customFilename?: string): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  const headers = [
    'Batch ID',
    'Batch Number',
    'Purchase Date',
    'Product Description',
    `Original Quantity (${unit})`,
    `Remaining Quantity (${unit})`,
    `Sold Quantity (${unit})`,
    `Unit Cost (${cur})`,
    `Total Original Cost (${cur})`,
    `Remaining Stock Value (${cur})`,
    `Average Selling Price (${cur})`,
    `Realized Profit (${cur})`,
    'Batch Status',
  ];

  const rows = batches.map((b) => {
    const origCost = b.original_quantity * b.unit_cost;
    const avgSelling = b.average_selling_price || 0;
    const profit = b.realized_profit || 0;

    return [
      `#${b.id}`,
      b.batch_number,
      b.purchase_date,
      prod,
      b.original_quantity,
      b.remaining_quantity,
      b.sold_quantity,
      b.unit_cost.toFixed(2),
      origCost.toFixed(2),
      b.remaining_value.toFixed(2),
      avgSelling > 0 ? avgSelling.toFixed(2) : '0.00',
      profit.toFixed(2),
      b.status,
    ];
  });

  const filename = customFilename || `stock_batches_inventory_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export total customers overview: Purchases, collections, dues, delivered, and pending units.
 */
export function exportCustomersSummaryCsv(
  customers: Customer[],
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const headers = [
    'Customer ID',
    'Customer Name',
    'Phone Number',
    'Delivery Address',
    'Registration Date',
    `Total Invoiced Sales (${cur})`,
    `Total Units Delivered (${unit})`,
    `Total Pending Units (${unit})`,
    `Delivered Value (${cur})`,
    `Pending Value (${cur})`,
    `Total Collections / Paid (${cur})`,
    `Outstanding Balance to Pay (${cur})`,
    'Account Financial Status',
    'Physical Fulfillment Status',
  ];

  const rows = customers.map((c) => {
    const delivered = c.total_delivered_quantity || 0;
    const pending = c.total_pending_quantity || 0;
    const hasDue = c.outstanding_balance > 0;
    const financialStatus = hasDue ? 'Has Due Balance' : 'Settled (Zero Due)';
    const fulfillmentStatus = pending > 0 ? `${pending} ${unit} Pending Dispatch` : 'Fully Fulfilled';

    return [
      `#${c.id}`,
      c.name,
      c.phone || '',
      c.address || '',
      c.created_at ? c.created_at.split('T')[0] : '',
      c.total_sales.toFixed(2),
      delivered,
      pending,
      (c.total_delivered_value || 0).toFixed(2),
      (c.total_pending_value || 0).toFixed(2),
      c.total_collections.toFixed(2),
      c.outstanding_balance.toFixed(2),
      financialStatus,
      fulfillmentStatus,
    ];
  });

  const filename = customFilename || `customers_summary_balances_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export all customer purchases and sales transactions with line-item breakdown.
 */
export function exportAllCustomerSalesCsv(
  sales: Sale[],
  customers: Customer[],
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  // Build a lookup map of customer phone & address
  const custMap = new Map<number, Customer>();
  customers.forEach((c) => custMap.set(c.id, c));

  const headers = [
    'Customer ID',
    'Customer Name',
    'Customer Phone',
    'Customer Address',
    'Sale / Invoice #',
    'Invoice Date',
    'Product Description',
    `Quantity Ordered (${unit})`,
    `Unit Selling Price (${cur})`,
    `Total Invoiced Amount (${cur})`,
    `Amount Paid (${cur})`,
    `Balance Remaining (${cur})`,
    'Payment Status',
    `Delivered Quantity (${unit})`,
    `Pending Units (${unit})`,
    'Delivery Status',
    `FIFO Product Cost (${cur})`,
    `Realized Profit (${cur})`,
    'Margin (%)',
    'Batches Used (FIFO Breakdown)',
  ];

  const rows = sales.map((s) => {
    const cust = custMap.get(s.customer_id);
    const delivered = s.delivered_quantity || 0;
    const pending = s.pending_quantity !== undefined ? s.pending_quantity : Math.max(0, s.quantity - delivered);
    const paid = s.amount_paid || 0;
    const balance = s.balance_due !== undefined ? s.balance_due : Math.max(0, s.total_sales - paid);
    const paymentStatus = s.payment_status || (balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID');
    const deliveryStatus = s.delivery_status || (pending <= 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIAL' : 'PENDING');
    const marginPct = s.total_sales > 0 ? ((s.profit / s.total_sales) * 100).toFixed(1) : '0.0';

    const batchBreakdown = s.batchDetails
      ? s.batchDetails.map((b) => `${b.batch_number} (${b.quantity} ${unit} @ ${cur}${b.unit_cost.toFixed(2)})`).join('; ')
      : '';

    return [
      `#${s.customer_id}`,
      s.customer_name,
      cust?.phone || '',
      cust?.address || '',
      `#${s.id}`,
      s.date,
      prod,
      s.quantity,
      s.selling_price.toFixed(2),
      s.total_sales.toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
      paymentStatus,
      delivered,
      pending,
      deliveryStatus,
      s.total_cost.toFixed(2),
      s.profit.toFixed(2),
      `${marginPct}%`,
      batchBreakdown,
    ];
  });

  const filename = customFilename || `customers_sales_transactions_detailed_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export an individual customer's chronological ledger statement.
 */
export function exportCustomerStatementCsv(
  customer: Customer,
  ledger: CustomerLedgerEntry[],
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const headers = [
    'Entry ID',
    'Date',
    'Customer Name',
    'Transaction Type',
    'Particulars / Reference',
    `Invoiced Quantity (${unit})`,
    `Delivered Quantity (${unit})`,
    `Pending Units (${unit})`,
    `Rate (${cur})`,
    `Debit (Sales Due) (${cur})`,
    `Credit (Payment Received) (${cur})`,
    `Running Balance to Pay (${cur})`,
  ];

  const rows = ledger.map((entry) => [
    `#${entry.id}`,
    entry.date,
    customer.name,
    entry.transaction_type,
    entry.reference,
    entry.quantity || 0,
    entry.delivered_quantity !== undefined ? entry.delivered_quantity : '—',
    entry.pending_units !== undefined ? entry.pending_units : '—',
    entry.rate > 0 ? entry.rate.toFixed(2) : '—',
    entry.debit > 0 ? entry.debit.toFixed(2) : '0.00',
    entry.credit > 0 ? entry.credit.toFixed(2) : '0.00',
    entry.balance.toFixed(2),
  ]);

  const cleanName = customer.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const filename = customFilename || `customer_statement_${cleanName}_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export an individual customer's sales orders with fulfillment and payment tracking.
 */
export function exportCustomerOrdersCsv(
  customer: Customer,
  sales: Sale[],
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  const headers = [
    'Sale / Invoice #',
    'Date',
    'Customer Name',
    'Product Description',
    `Ordered Quantity (${unit})`,
    `Unit Selling Price (${cur})`,
    `Total Sales Amount (${cur})`,
    `Amount Paid (${cur})`,
    `Balance Due (${cur})`,
    'Payment Status',
    `Delivered Quantity (${unit})`,
    `Pending Delivery Units (${unit})`,
    'Delivery Status',
    'FIFO Batches Allocated',
  ];

  const rows = sales.map((s) => {
    const delivered = s.delivered_quantity || 0;
    const pending = s.pending_quantity !== undefined ? s.pending_quantity : Math.max(0, s.quantity - delivered);
    const paid = s.amount_paid || 0;
    const balance = s.balance_due !== undefined ? s.balance_due : Math.max(0, s.total_sales - paid);
    const paymentStatus = s.payment_status || (balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID');
    const deliveryStatus = s.delivery_status || (pending <= 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIAL' : 'PENDING');

    const batches = s.batchDetails
      ? s.batchDetails.map((b) => `${b.batch_number}: ${b.quantity} ${unit}`).join('; ')
      : '';

    return [
      `#${s.id}`,
      s.date,
      customer.name,
      prod,
      s.quantity,
      s.selling_price.toFixed(2),
      s.total_sales.toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
      paymentStatus,
      delivered,
      pending,
      deliveryStatus,
      batches,
    ];
  });

  const cleanName = customer.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const filename = customFilename || `customer_orders_${cleanName}_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export customer dispatches / delivery log into CSV.
 */
export function exportCustomerDeliveriesCsv(
  customer: Customer,
  sales: Sale[],
  settings: Settings,
  customFilename?: string
): void {
  const unit = settings?.unit_name || 'Units';

  const headers = [
    'Dispatch Ref #',
    'Order / Sale #',
    'Dispatch Date',
    'Customer Name',
    `Dispatched Quantity (${unit})`,
    'Delivery Notes & Remarks',
  ];

  const rows: (string | number)[][] = [];

  sales.forEach((s) => {
    if (s.deliveries && s.deliveries.length > 0) {
      s.deliveries.forEach((d) => {
        rows.push([
          `#${d.id}`,
          `#${s.id}`,
          d.date,
          customer.name,
          d.quantity,
          d.notes || 'Dispatched goods to customer',
        ]);
      });
    }
  });

  const cleanName = customer.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const filename = customFilename || `customer_deliveries_${cleanName}_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export daily collections history into CSV.
 */
export function exportCollectionsCsv(
  collections: Collection[],
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';

  const headers = [
    'Receipt Ref #',
    'Collection Date',
    'Customer ID',
    'Customer Name',
    'Payment Method',
    `Amount Received (${cur})`,
    'Notes / Remarks',
  ];

  const rows = collections.map((c) => [
    `#${c.id}`,
    c.date,
    `#${c.customer_id}`,
    c.customer_name,
    c.payment_method,
    c.amount.toFixed(2),
    c.notes || '',
  ]);

  const filename = customFilename || `daily_collections_history_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export stock balance & batch valuation report into CSV.
 */
export function exportStockBalanceCsv(
  reportData: StockBalanceReportData,
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  const headers = [
    'Batch ID',
    'Batch Number',
    'Purchase Date',
    'Product Description',
    `Purchased Quantity (${unit})`,
    `Sold Quantity (${unit})`,
    `Remaining in Stock (${unit})`,
    `Unit Cost (${cur})`,
    `Remaining Stock Value (${cur})`,
    'Batch Status',
  ];

  const rows = (reportData.batches || []).map((b) => [
    `#${b.id}`,
    b.batch_number,
    b.purchase_date,
    prod,
    b.purchased_qty,
    b.sold_qty,
    b.remaining_qty,
    b.unit_cost.toFixed(2),
    b.remaining_value.toFixed(2),
    b.remaining_qty > 0 ? 'Active' : 'Exhausted',
  ]);

  const filename = customFilename || `stock_balance_valuation_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export item ledger stock audit trail into CSV.
 */
export function exportItemLedgerCsv(
  entries: ItemLedgerEntry[],
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';

  const headers = [
    'Ledger ID',
    'Transaction Date',
    'Transaction Type',
    'Reference / Particulars',
    'Batch Number',
    `Unit Cost (${cur})`,
    `Stock In (+) (${unit})`,
    `Stock Out (-) (${unit})`,
    `Running Stock Balance (${unit})`,
  ];

  const rows = entries.map((e) => [
    `#${e.id}`,
    e.date,
    e.transaction_type,
    e.reference,
    e.batch_number || '—',
    e.unit_cost !== undefined ? e.unit_cost.toFixed(2) : '—',
    e.stock_in > 0 ? e.stock_in : '0',
    e.stock_out > 0 ? e.stock_out : '0',
    e.running_balance,
  ]);

  const filename = customFilename || `item_ledger_audit_trail_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}

/**
 * Export profit report with sales margins and FIFO cost breakdown into CSV.
 */
export function exportProfitReportCsv(
  reportData: ProfitReportData,
  settings: Settings,
  customFilename?: string
): void {
  const cur = settings?.currency_symbol || '$';
  const unit = settings?.unit_name || 'Units';
  const prod = settings?.product_name || 'Product';

  const headers = [
    'Sale ID',
    'Sale Date',
    'Customer Name',
    'Product Description',
    `Quantity Sold (${unit})`,
    `Selling Price per Unit (${cur})`,
    `Total Sales Revenue (${cur})`,
    `FIFO Cost of Goods (${cur})`,
    `Gross Profit (${cur})`,
    'Gross Margin (%)',
    'Batches Used',
  ];

  const rows = (reportData.sales || []).map((s) => [
    `#${s.id}`,
    s.date,
    s.customer_name,
    prod,
    s.quantity,
    s.selling_price.toFixed(2),
    s.total_sales.toFixed(2),
    s.total_cost.toFixed(2),
    s.profit.toFixed(2),
    `${s.margin_percent.toFixed(1)}%`,
    s.batchesUsed || '',
  ]);

  const filename = customFilename || `profit_and_loss_report_${formatDateStamp()}`;
  downloadCsv(filename, headers, rows);
}
