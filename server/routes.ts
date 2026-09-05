import { Router, Request, Response } from 'express';
import { queryAll, queryOne, runQuery, getDb, resetDatabase, wipeDatabase, beginTx, commitTx, rollbackTx } from './db.js';

export const apiRouter = Router();

// Helper to round accurately to 2 decimals
const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// Helper to recalculate running balance and pending units for a specific customer
function recalculateCustomerLedger(customerId: number) {
  const entries = queryAll<{
    id: number;
    transaction_type: string;
    quantity: number;
    delivered_quantity: number;
    debit: number;
    credit: number;
  }>(
    'SELECT id, transaction_type, quantity, delivered_quantity, debit, credit FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC',
    [customerId]
  );

  let runningBal = 0;
  let runningPending = 0;

  for (const entry of entries) {
    runningBal = round2(runningBal + (entry.debit || 0) - (entry.credit || 0));
    if (entry.transaction_type === 'SALE') {
      const q = entry.quantity || 0;
      const d = entry.delivered_quantity || 0;
      runningPending = round2(runningPending + Math.max(0, q - d));
    } else if (entry.transaction_type === 'DELIVERY') {
      const d = entry.delivered_quantity || 0;
      runningPending = Math.max(0, round2(runningPending - d));
    }
    runQuery('UPDATE customer_ledger SET balance = ?, pending_units = ? WHERE id = ?', [
      runningBal,
      runningPending,
      entry.id,
    ]);
  }
}

// Helper to recalculate running stock balance in item_ledger
function recalculateItemLedger() {
  const entries = queryAll<{ id: number; stock_in: number; stock_out: number }>(
    'SELECT id, stock_in, stock_out FROM item_ledger ORDER BY date ASC, id ASC'
  );
  let runningBal = 0;
  for (const entry of entries) {
    runningBal = round2(runningBal + (entry.stock_in || 0) - (entry.stock_out || 0));
    runQuery('UPDATE item_ledger SET running_balance = ? WHERE id = ?', [runningBal, entry.id]);
  }
}

// Helper to recalculate sale amount_paid and payment_status for all sales of a customer based on actual collections
function recalculateCustomerSalesPayments(customerId: number) {
  // Reset all sales for this customer
  runQuery("UPDATE sales SET amount_paid = 0, payment_status = 'UNPAID' WHERE customer_id = ?", [customerId]);

  const customerSales = queryAll<{ id: number; total_sales: number }>(
    'SELECT id, total_sales FROM sales WHERE customer_id = ? ORDER BY date ASC, id ASC',
    [customerId]
  );

  const customerCollections = queryAll<{ amount: number }>(
    'SELECT amount FROM collections WHERE customer_id = ? ORDER BY date ASC, id ASC',
    [customerId]
  );

  let totalCollected = customerCollections.reduce((sum, c) => sum + (c.amount || 0), 0);

  for (const s of customerSales) {
    if (totalCollected <= 0) break;
    const paymentForThis = round2(Math.min(s.total_sales, totalCollected));
    totalCollected = round2(totalCollected - paymentForThis);
    const status = paymentForThis >= (s.total_sales - 0.005) ? 'PAID' : (paymentForThis > 0 ? 'PARTIAL' : 'UNPAID');
    runQuery('UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ?', [paymentForThis, status, s.id]);
  }
}

// Settings
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    await getDb();
    const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settings: Record<string, string> = {
      product_name: 'Commercial Grade Coffee Beans (1kg Bag)',
      currency_symbol: '$',
      unit_name: 'Bags',
    };
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    await getDb();
    const { product_name, currency_symbol, unit_name } = req.body;
    if (product_name) runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['product_name', product_name]);
    if (currency_symbol) runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['currency_symbol', currency_symbol]);
    if (unit_name) runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['unit_name', unit_name]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset database to demo data
apiRouter.post('/reset-data', async (_req: Request, res: Response) => {
  try {
    await resetDatabase();
    res.json({ success: true, message: 'Database reset to initial sample demo state' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Wipe all database records (fresh start with clean slate)
apiRouter.post('/wipe-data', async (req: Request, res: Response) => {
  try {
    const keepCustomers = Boolean(req.body?.keepCustomers);
    await wipeDatabase(keepCustomers);
    res.json({
      success: true,
      message: keepCustomers
        ? 'All transactions, stock batches, and ledgers cleared successfully. Customer accounts retained.'
        : 'All transaction data, batches, sales, and customers completely cleared. Ready for fresh operations.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// 1. MAIN DASHBOARD
apiRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    await getDb();
    const today = new Date().toISOString().split('T')[0];

    // Stock metrics
    const stockBatches = queryAll<{ remaining_quantity: number; unit_cost: number }>(
      'SELECT remaining_quantity, unit_cost FROM stock_batches'
    );
    let totalStockAvailable = 0;
    let totalStockValue = 0;
    let activeBatchesCount = 0;

    stockBatches.forEach(b => {
      if (b.remaining_quantity > 0) {
        activeBatchesCount++;
        totalStockAvailable += b.remaining_quantity;
        totalStockValue += (b.remaining_quantity * b.unit_cost);
      }
    });

    totalStockAvailable = round2(totalStockAvailable);
    totalStockValue = round2(totalStockValue);
    const averagePurchaseCost = totalStockAvailable > 0 ? round2(totalStockValue / totalStockAvailable) : 0;

    // Sales metrics
    const salesSummary = queryOne<{ total_sales: number; total_profit: number; total_qty: number }>(`
      SELECT 
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(SUM(quantity), 0) as total_qty
      FROM sales
    `) || { total_sales: 0, total_profit: 0, total_qty: 0 };

    const totalSales = round2(salesSummary.total_sales);
    const totalProfit = round2(salesSummary.total_profit);
    const averageSellingPrice = salesSummary.total_qty > 0 ? round2(totalSales / salesSummary.total_qty) : 0;

    // Collections metrics
    const collectionsSummary = queryOne<{ total_collected: number }>(
      'SELECT COALESCE(SUM(amount), 0) as total_collected FROM collections'
    ) || { total_collected: 0 };
    const totalCollected = round2(collectionsSummary.total_collected);

    // Outstanding = Total Sales - Total Collections
    const totalCustomerOutstanding = round2(Math.max(0, totalSales - totalCollected));

    // Today's collection
    const todayCollectionRow = queryOne<{ today_amount: number }>(
      'SELECT COALESCE(SUM(amount), 0) as today_amount FROM collections WHERE date = ?',
      [today]
    ) || { today_amount: 0 };
    const todayCollection = round2(todayCollectionRow.today_amount);

    // Delivery summary across all client sales
    const deliverySummaryRow = queryOne<{ 
      total_ordered_units: number;
      total_delivered_units: number; 
      total_pending_units: number;
      total_delivered_value: number;
      total_pending_value: number;
    }>(`
      SELECT 
        COALESCE(SUM(quantity), 0) as total_ordered_units,
        COALESCE(SUM(COALESCE(delivered_quantity, 0)), 0) as total_delivered_units,
        COALESCE(SUM(ROUND(quantity - COALESCE(delivered_quantity, 0), 2)), 0) as total_pending_units,
        COALESCE(SUM(ROUND(COALESCE(delivered_quantity, 0) * selling_price, 2)), 0) as total_delivered_value,
        COALESCE(SUM(ROUND((quantity - COALESCE(delivered_quantity, 0)) * selling_price, 2)), 0) as total_pending_value
      FROM sales
    `) || { 
      total_ordered_units: 0, 
      total_delivered_units: 0, 
      total_pending_units: 0, 
      total_delivered_value: 0, 
      total_pending_value: 0 
    };

    const totalOrderedUnits = round2(deliverySummaryRow.total_ordered_units);
    const totalDeliveredUnits = round2(deliverySummaryRow.total_delivered_units);
    const totalPendingDeliveries = round2(deliverySummaryRow.total_pending_units);
    const totalDeliveredValue = round2(deliverySummaryRow.total_delivered_value);
    const totalPendingValue = round2(deliverySummaryRow.total_pending_value);

    // Recent purchases (last 5)
    const recentPurchases = queryAll(`
      SELECT id, date, batch_number, quantity, unit_purchase_price, total_amount, notes
      FROM purchases
      ORDER BY id DESC
      LIMIT 5
    `);

    // Recent sales (last 5)
    const recentSales = queryAll(`
      SELECT 
        s.id, 
        s.date, 
        s.customer_id, 
        c.name as customer_name, 
        s.quantity, 
        s.selling_price, 
        s.total_sales, 
        s.profit,
        COALESCE(s.amount_paid, 0) as amount_paid,
        ROUND(s.total_sales - COALESCE(s.amount_paid, 0), 2) as balance_due,
        COALESCE(s.payment_status, 'UNPAID') as payment_status,
        COALESCE(s.delivered_quantity, 0) as delivered_quantity,
        ROUND(s.quantity - COALESCE(s.delivered_quantity, 0), 2) as pending_quantity,
        COALESCE(s.delivery_status, 'PENDING') as delivery_status
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      ORDER BY s.id DESC
      LIMIT 5
    `);

    // Recent collections (last 5)
    const recentCollections = queryAll(`
      SELECT col.id, col.date, col.customer_id, c.name as customer_name, col.amount, col.payment_method, col.notes
      FROM collections col
      JOIN customers c ON col.customer_id = c.id
      ORDER BY col.id DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalStockAvailable,
        totalStockValue,
        activeBatchesCount,
        totalSales,
        totalProfit,
        totalCustomerOutstanding,
        todayCollection,
        totalOrderedUnits,
        totalDeliveredUnits,
        totalDeliveredValue,
        totalPendingDeliveries,
        totalPendingValue,
        averagePurchaseCost,
        averageSellingPrice,
        recentPurchases,
        recentSales,
        recentCollections,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. BATCHES & INVENTORY
apiRouter.get('/batches', async (_req: Request, res: Response) => {
  try {
    await getDb();

    // Query batches with realized sales, realized cost, and realized profit
    const batches = queryAll(`
      SELECT 
        sb.id, 
        sb.batch_number, 
        sb.purchase_date, 
        sb.original_quantity, 
        sb.remaining_quantity, 
        ROUND(sb.original_quantity - sb.remaining_quantity, 2) as sold_quantity,
        sb.unit_cost, 
        ROUND(sb.remaining_quantity * sb.unit_cost, 2) as remaining_value,
        CASE WHEN sb.remaining_quantity > 0 THEN 'Active' ELSE 'Exhausted' END as status,
        COALESCE(SUM(sbd.quantity * s.selling_price), 0) as total_batch_sales,
        COALESCE(SUM(sbd.quantity * sbd.unit_cost), 0) as total_batch_cost,
        COALESCE(SUM(sbd.quantity * (s.selling_price - sbd.unit_cost)), 0) as realized_profit,
        COALESCE(ROUND(SUM(sbd.quantity * s.selling_price) / NULLIF(SUM(sbd.quantity), 0), 2), 0) as average_selling_price
      FROM stock_batches sb
      LEFT JOIN sale_batch_details sbd ON sb.id = sbd.batch_id
      LEFT JOIN sales s ON sbd.sale_id = s.id
      GROUP BY sb.id
      ORDER BY sb.id DESC
    `);

    // Calculate overall stats
    let totalPurchased = 0;
    let totalPurchasedValue = 0;
    let totalSold = 0;
    let totalRemaining = 0;
    let totalRemainingValue = 0;
    let activeBatches = 0;

    batches.forEach(b => {
      totalPurchased += b.original_quantity;
      totalPurchasedValue += (b.original_quantity * b.unit_cost);
      totalSold += b.sold_quantity;
      totalRemaining += b.remaining_quantity;
      totalRemainingValue += b.remaining_value;
      if (b.remaining_quantity > 0) activeBatches++;
    });

    const averagePurchaseCost = totalRemaining > 0 ? round2(totalRemainingValue / totalRemaining) : 0;
    const allTimeAveragePurchaseCost = totalPurchased > 0 ? round2(totalPurchasedValue / totalPurchased) : 0;

    // Overall average selling price across all sales
    const salesSummary = queryOne<{ total_sales: number; total_qty: number }>(`
      SELECT 
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(SUM(quantity), 0) as total_qty
      FROM sales
    `) || { total_sales: 0, total_qty: 0 };
    const averageSellingPrice = salesSummary.total_qty > 0 ? round2(salesSummary.total_sales / salesSummary.total_qty) : 0;

    // Populate fallback average_selling_price for batches with 0 sales so UI can show benchmark
    const batchesWithBenchmark = batches.map(b => ({
      ...b,
      total_batch_sales: round2(b.total_batch_sales),
      total_batch_cost: round2(b.total_batch_cost),
      realized_profit: round2(b.realized_profit),
      average_selling_price: b.sold_quantity > 0 && b.average_selling_price > 0 ? b.average_selling_price : averageSellingPrice,
      has_realized_sales: b.sold_quantity > 0,
    }));

    // Suggest next batch number
    const maxBatch = queryOne<{ max_num: string }>('SELECT batch_number as max_num FROM stock_batches ORDER BY id DESC LIMIT 1');
    let nextBatchNumber = 'BATCH-001';
    if (maxBatch && maxBatch.max_num) {
      const match = maxBatch.max_num.match(/(\d+)$/);
      if (match) {
        const nextId = parseInt(match[1], 10) + 1;
        nextBatchNumber = `BATCH-${String(nextId).padStart(3, '0')}`;
      }
    }

    res.json({
      success: true,
      data: {
        batches: batchesWithBenchmark,
        nextBatchNumber,
        summary: {
          totalPurchased: round2(totalPurchased),
          totalSold: round2(totalSold),
          totalRemaining: round2(totalRemaining),
          totalRemainingValue: round2(totalRemainingValue),
          activeBatches,
          totalBatches: batches.length,
          averagePurchaseCost,
          allTimeAveragePurchaseCost,
          averageSellingPrice,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. PURCHASE ENTRY & PURCHASES LIST
apiRouter.get('/purchases', async (_req: Request, res: Response) => {
  try {
    await getDb();
    const purchases = queryAll(`
      SELECT 
        p.id, 
        p.date, 
        p.batch_number, 
        p.quantity, 
        p.unit_purchase_price, 
        p.total_amount, 
        p.notes,
        COALESCE(sb.remaining_quantity, p.quantity) as remaining_quantity,
        COALESCE(sb.original_quantity, p.quantity) as original_quantity,
        CASE WHEN COALESCE(sb.remaining_quantity, p.quantity) > 0 THEN 'Active' ELSE 'Exhausted' END as status
      FROM purchases p
      LEFT JOIN stock_batches sb ON p.batch_number = sb.batch_number
      ORDER BY p.id DESC
    `);
    res.json({ success: true, data: purchases });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/purchases', async (req: Request, res: Response) => {
  try {
    const database = await getDb();
    const { date, batch_number, quantity, unit_purchase_price, notes } = req.body;

    const numQty = parseFloat(quantity);
    const numPrice = parseFloat(unit_purchase_price);

    if (!date) return res.status(400).json({ success: false, error: 'Date is required' });
    if (isNaN(numQty) || numQty <= 0) return res.status(400).json({ success: false, error: 'Quantity must be greater than zero' });
    if (isNaN(numPrice) || numPrice < 0) return res.status(400).json({ success: false, error: 'Purchase price must be positive' });

    let finalBatchNumber = (batch_number || '').trim();
    if (!finalBatchNumber) {
      const maxBatch = queryOne<{ max_num: string }>('SELECT batch_number as max_num FROM stock_batches ORDER BY id DESC LIMIT 1');
      if (maxBatch && maxBatch.max_num) {
        const match = maxBatch.max_num.match(/(\d+)$/);
        const nextId = match ? parseInt(match[1], 10) + 1 : 1;
        finalBatchNumber = `BATCH-${String(nextId).padStart(3, '0')}`;
      } else {
        finalBatchNumber = 'BATCH-001';
      }
    }

    // Check duplicate batch number
    const existing = queryOne('SELECT id FROM stock_batches WHERE batch_number = ?', [finalBatchNumber]);
    if (existing) {
      return res.status(400).json({ success: false, error: `Batch number "${finalBatchNumber}" already exists. Please use a unique batch number.` });
    }

    const totalAmount = round2(numQty * numPrice);

    // Begin SQL Transaction
    beginTx();

    try {
      // 1. Insert into purchases
      runQuery(
        'INSERT INTO purchases (date, batch_number, quantity, unit_purchase_price, total_amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [date, finalBatchNumber, numQty, numPrice, totalAmount, notes || '']
      );

      // 2. Insert into stock_batches
      const batchRes = runQuery(
        'INSERT INTO stock_batches (batch_number, purchase_date, original_quantity, remaining_quantity, unit_cost) VALUES (?, ?, ?, ?, ?)',
        [finalBatchNumber, date, numQty, numPrice <= 0 ? 0 : numQty, numPrice]
      );
      const batchId = batchRes.lastInsertRowid;

      // 3. Item Ledger Stock In
      const lastLedger = queryOne<{ running_balance: number }>('SELECT running_balance FROM item_ledger ORDER BY id DESC LIMIT 1');
      const prevBalance = lastLedger ? lastLedger.running_balance : 0;
      const newBalance = round2(prevBalance + numQty);

      runQuery(
        'INSERT INTO item_ledger (date, transaction_type, reference, batch_id, stock_in, stock_out, running_balance) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [date, 'PURCHASE', `Purchase ${finalBatchNumber}`, batchId, numQty, 0, newBalance]
      );

      commitTx();

      res.json({
        success: true,
        message: `Batch ${finalBatchNumber} purchased successfully with ${numQty} units at $${numPrice.toFixed(2)}`,
        data: {
          batch_number: finalBatchNumber,
          quantity: numQty,
          unit_purchase_price: numPrice,
          total_amount: totalAmount,
          new_stock_balance: newBalance,
        },
      });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a purchase and its associated stock batch (if not already consumed by sales)
apiRouter.delete('/purchases/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const purchaseId = parseInt(req.params.id, 10);
    const purchase = queryOne<any>('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    if (!purchase) {
      return res.status(404).json({ success: false, error: `Purchase #${purchaseId} not found` });
    }

    const batch = queryOne<any>('SELECT * FROM stock_batches WHERE batch_number = ?', [purchase.batch_number]);
    if (batch && round2(batch.remaining_quantity) < round2(batch.original_quantity)) {
      const sold = round2(batch.original_quantity - batch.remaining_quantity);
      return res.status(400).json({
        success: false,
        error: `Cannot delete Purchase #${purchaseId} (Batch "${batch.batch_number}") because ${sold} units have already been sold in customer sales. Please delete or adjust the associated sales first.`,
      });
    }

    beginTx();
    try {
      if (batch) {
        runQuery('DELETE FROM item_ledger WHERE batch_id = ?', [batch.id]);
        runQuery('DELETE FROM stock_batches WHERE id = ?', [batch.id]);
      }
      runQuery('DELETE FROM purchases WHERE id = ?', [purchaseId]);
      recalculateItemLedger();
      commitTx();

      res.json({ success: true, message: `Purchase #${purchaseId} (${purchase.batch_number}) deleted successfully` });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a stock batch directly
apiRouter.delete('/batches/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const batchId = parseInt(req.params.id, 10);
    const batch = queryOne<any>('SELECT * FROM stock_batches WHERE id = ?', [batchId]);
    if (!batch) {
      return res.status(404).json({ success: false, error: `Batch #${batchId} not found` });
    }

    if (round2(batch.remaining_quantity) < round2(batch.original_quantity)) {
      const sold = round2(batch.original_quantity - batch.remaining_quantity);
      return res.status(400).json({
        success: false,
        error: `Cannot delete Batch "${batch.batch_number}" because ${sold} units have already been sold in customer sales. Please delete or adjust the associated sales first.`,
      });
    }

    beginTx();
    try {
      runQuery('DELETE FROM item_ledger WHERE batch_id = ?', [batchId]);
      runQuery('DELETE FROM purchases WHERE batch_number = ?', [batch.batch_number]);
      runQuery('DELETE FROM stock_batches WHERE id = ?', [batchId]);
      recalculateItemLedger();
      commitTx();

      res.json({ success: true, message: `Batch ${batch.batch_number} deleted successfully` });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. CUSTOMERS
apiRouter.get('/customers', async (_req: Request, res: Response) => {
  try {
    await getDb();
    const customers = queryAll(`
      SELECT 
        c.id, 
        c.name, 
        c.phone, 
        c.address, 
        c.created_at,
        COALESCE(sales_sum.total_sales, 0) as total_sales,
        COALESCE(sales_sum.total_delivered_quantity, 0) as total_delivered_quantity,
        COALESCE(sales_sum.total_pending_quantity, 0) as total_pending_quantity,
        COALESCE(sales_sum.total_delivered_value, 0) as total_delivered_value,
        COALESCE(sales_sum.total_pending_value, 0) as total_pending_value,
        COALESCE(col_sum.total_collections, 0) as total_collections,
        ROUND(COALESCE(sales_sum.total_sales, 0) - COALESCE(col_sum.total_collections, 0), 2) as outstanding_balance
      FROM customers c
      LEFT JOIN (
        SELECT 
          customer_id, 
          SUM(total_sales) as total_sales,
          SUM(COALESCE(delivered_quantity, 0)) as total_delivered_quantity,
          SUM(COALESCE(quantity, 0) - COALESCE(delivered_quantity, 0)) as total_pending_quantity,
          SUM(COALESCE(delivered_quantity, 0) * selling_price) as total_delivered_value,
          SUM((COALESCE(quantity, 0) - COALESCE(delivered_quantity, 0)) * selling_price) as total_pending_value
        FROM sales
        GROUP BY customer_id
      ) sales_sum ON c.id = sales_sum.customer_id
      LEFT JOIN (
        SELECT customer_id, SUM(amount) as total_collections
        FROM collections
        GROUP BY customer_id
      ) col_sum ON c.id = col_sum.customer_id
      ORDER BY c.name ASC
    `);

    res.json({ success: true, data: customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    await getDb();
    const { name, phone, address } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }
    const today = new Date().toISOString().split('T')[0];
    const result = runQuery(
      'INSERT INTO customers (name, phone, address, created_at) VALUES (?, ?, ?, ?)',
      [name.trim(), (phone || '').trim(), (address || '').trim(), today]
    );

    res.json({
      success: true,
      message: 'Customer added successfully',
      data: { id: result.lastInsertRowid, name: name.trim() },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const id = parseInt(req.params.id, 10);
    const { name, phone, address } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }

    runQuery(
      'UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ?',
      [name.trim(), (phone || '').trim(), (address || '').trim(), id]
    );

    res.json({ success: true, message: 'Customer updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a customer and cascade cleanup their sales, collections, and ledgers
apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const customerId = parseInt(req.params.id, 10);
    const customer = queryOne<any>('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ success: false, error: `Customer #${customerId} not found` });
    }

    beginTx();
    try {
      // Find all sales for this customer and restore batch quantities
      const customerSales = queryAll<{ id: number }>('SELECT id FROM sales WHERE customer_id = ?', [customerId]);
      for (const cs of customerSales) {
        const batchDetails = queryAll<{ batch_id: number; quantity: number }>(
          'SELECT batch_id, quantity FROM sale_batch_details WHERE sale_id = ?',
          [cs.id]
        );
        for (const bd of batchDetails) {
          runQuery('UPDATE stock_batches SET remaining_quantity = remaining_quantity + ? WHERE id = ?', [
            bd.quantity,
            bd.batch_id,
          ]);
        }
        runQuery('DELETE FROM sale_batch_details WHERE sale_id = ?', [cs.id]);
        runQuery('DELETE FROM sale_deliveries WHERE sale_id = ?', [cs.id]);
        runQuery(
          "DELETE FROM item_ledger WHERE transaction_type = 'SALE' AND (reference LIKE ? OR reference LIKE ?)",
          [`Sale #${cs.id} %`, `Sale #${cs.id}`]
        );
      }

      runQuery('DELETE FROM sales WHERE customer_id = ?', [customerId]);
      runQuery('DELETE FROM collections WHERE customer_id = ?', [customerId]);
      runQuery('DELETE FROM customer_ledger WHERE customer_id = ?', [customerId]);
      runQuery('DELETE FROM customers WHERE id = ?', [customerId]);

      recalculateItemLedger();
      commitTx();

      res.json({ success: true, message: `Customer "${customer.name}" and all associated records deleted successfully` });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. INDIVIDUAL CUSTOMER ACCOUNT & LEDGER
apiRouter.get('/customers/:id/ledger', async (req: Request, res: Response) => {
  try {
    await getDb();
    const customerId = parseInt(req.params.id, 10);
    const customer = queryOne('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const { startDate, endDate } = req.query;

    let ledgerQuery = `
      SELECT id, date, transaction_type, reference, quantity, rate, debit, credit, balance,
             COALESCE(delivered_quantity, 0) as delivered_quantity,
             COALESCE(pending_units, 0) as pending_units
      FROM customer_ledger
      WHERE customer_id = ?
    `;
    const params: any[] = [customerId];

    if (startDate) {
      ledgerQuery += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      ledgerQuery += ' AND date <= ?';
      params.push(endDate);
    }

    ledgerQuery += ' ORDER BY id ASC';

    const rawLedger = queryAll<any>(ledgerQuery, params);

    // Compute running pending units and ensure accurate synchronization
    let runningPending = 0;
    const ledger = rawLedger.map((row: any) => {
      const delQty = row.delivered_quantity || 0;
      const ordQty = row.quantity || 0;
      if (row.transaction_type === 'SALE') {
        runningPending = round2(runningPending + Math.max(0, ordQty - delQty));
      } else if (row.transaction_type === 'DELIVERY') {
        runningPending = Math.max(0, round2(runningPending - delQty));
      }
      return {
        ...row,
        delivered_quantity: delQty,
        pending_units: row.pending_units !== undefined && row.pending_units !== null && row.pending_units !== 0 
          ? row.pending_units 
          : runningPending,
      };
    });

    // Aggregate metrics for this customer
    const salesAgg = queryOne<{
      total_sales: number;
      total_ordered_units: number;
      total_delivered_units: number;
      total_pending_units: number;
      total_delivered_value: number;
      total_pending_value: number;
    }>(
      `SELECT 
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(SUM(quantity), 0) as total_ordered_units,
        COALESCE(SUM(COALESCE(delivered_quantity, 0)), 0) as total_delivered_units,
        COALESCE(SUM(quantity - COALESCE(delivered_quantity, 0)), 0) as total_pending_units,
        COALESCE(SUM(COALESCE(delivered_quantity, 0) * selling_price), 0) as total_delivered_value,
        COALESCE(SUM((quantity - COALESCE(delivered_quantity, 0)) * selling_price), 0) as total_pending_value
      FROM sales WHERE customer_id = ?`,
      [customerId]
    ) || {
      total_sales: 0,
      total_ordered_units: 0,
      total_delivered_units: 0,
      total_pending_units: 0,
      total_delivered_value: 0,
      total_pending_value: 0,
    };

    const colTotal = queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) as total FROM collections WHERE customer_id = ?',
      [customerId]
    ) || { total: 0 };

    const totalSales = round2(salesAgg.total_sales);
    const totalCollections = round2(colTotal.total);
    const outstandingBalance = round2(totalSales - totalCollections);
    const totalDeliveredValue = round2(salesAgg.total_delivered_value);
    const totalPendingValue = round2(salesAgg.total_pending_value);
    const totalOrderedUnits = round2(salesAgg.total_ordered_units);
    const totalDeliveredUnits = round2(salesAgg.total_delivered_units);
    const totalPendingUnits = round2(salesAgg.total_pending_units);

    // Sales details for this customer with delivery records
    const customerSales = queryAll<any>(
      `SELECT 
        s.id, 
        s.date, 
        s.customer_id, 
        c.name as customer_name, 
        s.quantity, 
        s.selling_price, 
        s.total_sales, 
        s.total_cost, 
        s.profit,
        COALESCE(s.amount_paid, 0) as amount_paid,
        ROUND(s.total_sales - COALESCE(s.amount_paid, 0), 2) as balance_due,
        COALESCE(s.payment_status, 'UNPAID') as payment_status,
        COALESCE(s.delivered_quantity, 0) as delivered_quantity,
        ROUND(s.quantity - COALESCE(s.delivered_quantity, 0), 2) as pending_quantity,
        COALESCE(s.delivery_status, 'PENDING') as delivery_status
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.customer_id = ?
      ORDER BY s.id DESC`,
      [customerId]
    );

    const saleDeliveries = queryAll<any>(`
      SELECT sd.id, sd.sale_id, sd.date, sd.quantity, sd.notes
      FROM sale_deliveries sd
      JOIN sales s ON sd.sale_id = s.id
      WHERE s.customer_id = ?
      ORDER BY sd.id ASC
    `, [customerId]);

    const deliveryMap = new Map<number, any[]>();
    saleDeliveries.forEach((d) => {
      if (!deliveryMap.has(d.sale_id)) deliveryMap.set(d.sale_id, []);
      deliveryMap.get(d.sale_id)!.push(d);
    });

    const salesWithDeliveries = customerSales.map(s => ({
      ...s,
      deliveries: deliveryMap.get(s.id) || []
    }));

    res.json({
      success: true,
      data: {
        customer,
        summary: {
          totalSales,
          totalCollections,
          outstandingBalance,
          totalDeliveredValue,
          totalPendingValue,
          totalOrderedUnits,
          totalDeliveredUnits,
          totalPendingUnits,
        },
        sales: salesWithDeliveries,
        ledger,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. SALES ENTRY (Single & Multiple Sales in One Page!)
apiRouter.get('/sales', async (_req: Request, res: Response) => {
  try {
    await getDb();
    const sales = queryAll(`
      SELECT 
        s.id, 
        s.date, 
        s.customer_id, 
        c.name as customer_name, 
        s.quantity, 
        s.selling_price, 
        s.total_sales, 
        s.total_cost, 
        s.profit,
        ROUND((s.profit / NULLIF(s.total_sales, 0)) * 100, 1) as profit_margin,
        COALESCE(s.amount_paid, 0) as amount_paid,
        ROUND(s.total_sales - COALESCE(s.amount_paid, 0), 2) as balance_due,
        COALESCE(s.payment_status, 'UNPAID') as payment_status,
        COALESCE(s.delivered_quantity, 0) as delivered_quantity,
        ROUND(s.quantity - COALESCE(s.delivered_quantity, 0), 2) as pending_quantity,
        COALESCE(s.delivery_status, 'PENDING') as delivery_status
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      ORDER BY s.id DESC
    `);

    // Attach batch allocations for each sale
    const saleBatchDetails = queryAll(`
      SELECT sbd.sale_id, sbd.batch_id, sb.batch_number, sbd.quantity, sbd.unit_cost, sbd.total_cost
      FROM sale_batch_details sbd
      JOIN stock_batches sb ON sbd.batch_id = sb.id
    `);

    // Attach delivery fulfillment records for each sale
    const saleDeliveries = queryAll(`
      SELECT sd.id, sd.sale_id, sd.date, sd.quantity, sd.notes
      FROM sale_deliveries sd
      ORDER BY sd.id ASC
    `);

    const batchMap = new Map<number, any[]>();
    saleBatchDetails.forEach((d) => {
      if (!batchMap.has(d.sale_id)) batchMap.set(d.sale_id, []);
      batchMap.get(d.sale_id)!.push(d);
    });

    const deliveryMap = new Map<number, any[]>();
    saleDeliveries.forEach((d) => {
      if (!deliveryMap.has(d.sale_id)) deliveryMap.set(d.sale_id, []);
      deliveryMap.get(d.sale_id)!.push(d);
    });

    const salesWithDetails = sales.map((s) => ({
      ...s,
      batchDetails: batchMap.get(s.id) || [],
      deliveries: deliveryMap.get(s.id) || [],
    }));

    res.json({ success: true, data: salesWithDetails });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

interface BatchAllocation {
  batch_id: number;
  quantity: number;
}

interface SaleInput {
  date: string;
  customer_id: number;
  quantity: number;
  selling_price: number;
  batches: BatchAllocation[];
  amount_paid?: number; // Upfront payment
  payment_method?: string; // Cash, Bank Transfer, etc.
  payment_notes?: string;
  delivered_quantity?: number; // Upfront delivery dispatched
  delivery_notes?: string;
}

apiRouter.post('/sales', async (req: Request, res: Response) => {
  try {
    const database = await getDb();
    const salesInput: SaleInput[] = Array.isArray(req.body.sales) ? req.body.sales : [req.body];

    if (!salesInput.length) {
      return res.status(400).json({ success: false, error: 'No sales provided to save' });
    }

    // Pre-validation across all sales
    for (let i = 0; i < salesInput.length; i++) {
      const sale = salesInput[i];
      const prefix = salesInput.length > 1 ? `Sale row #${i + 1}: ` : '';

      if (!sale.date) return res.status(400).json({ success: false, error: `${prefix}Date is required` });
      if (!sale.customer_id) return res.status(400).json({ success: false, error: `${prefix}Customer is required` });

      const qty = parseFloat(String(sale.quantity));
      const price = parseFloat(String(sale.selling_price));

      if (isNaN(qty) || qty <= 0) return res.status(400).json({ success: false, error: `${prefix}Quantity must be greater than 0` });
      if (isNaN(price) || price < 0) return res.status(400).json({ success: false, error: `${prefix}Selling price must be valid` });

      if (!sale.batches || !sale.batches.length) {
        return res.status(400).json({ success: false, error: `${prefix}At least one batch must be selected` });
      }

      // Check sum of batch quantities equals sale quantity
      let allocatedSum = 0;
      for (const b of sale.batches) {
        const bQty = parseFloat(String(b.quantity));
        if (isNaN(bQty) || bQty <= 0) {
          return res.status(400).json({ success: false, error: `${prefix}Batch quantity must be greater than 0` });
        }
        allocatedSum += bQty;
      }

      allocatedSum = round2(allocatedSum);

      // Automatically reconcile quantity if missing or matching within floating point tolerance
      if (isNaN(qty) || qty <= 0 || Math.abs(allocatedSum - qty) < 0.005) {
        sale.quantity = allocatedSum;
      } else if (round2(allocatedSum) !== round2(qty)) {
        return res.status(400).json({
          success: false,
          error: `${prefix}Batch allocated quantity (${round2(allocatedSum)}) does not match sale total quantity (${round2(qty)})`,
        });
      }
    }

    // Begin atomic transaction
    beginTx();

    try {
      const createdSales: any[] = [];

      for (let i = 0; i < salesInput.length; i++) {
        const sale = salesInput[i];
        const qty = parseFloat(String(sale.quantity));
        const price = parseFloat(String(sale.selling_price));
        const totalSales = round2(qty * price);

        // Fetch customer name for reference
        const customer = queryOne<{ name: string }>('SELECT name FROM customers WHERE id = ?', [sale.customer_id]);
        const customerName = customer ? customer.name : `Customer #${sale.customer_id}`;

        // Validate and compute actual purchase cost for allocated batches
        let totalCost = 0;
        const verifiedBatches: { batch_id: number; batch_number: string; quantity: number; unit_cost: number; total_cost: number }[] = [];

        for (const b of sale.batches) {
          const bQty = parseFloat(String(b.quantity));
          const batchRow = queryOne<{ id: number; batch_number: string; remaining_quantity: number; unit_cost: number }>(
            'SELECT id, batch_number, remaining_quantity, unit_cost FROM stock_batches WHERE id = ?',
            [b.batch_id]
          );

          if (!batchRow) {
            throw new Error(`Batch ID ${b.batch_id} not found`);
          }

          if (batchRow.remaining_quantity < bQty) {
            throw new Error(
              `Batch ${batchRow.batch_number} has only ${batchRow.remaining_quantity} units available, but ${bQty} units were requested`
            );
          }

          const batchTotalCost = round2(bQty * batchRow.unit_cost);
          totalCost += batchTotalCost;
          verifiedBatches.push({
            batch_id: batchRow.id,
            batch_number: batchRow.batch_number,
            quantity: bQty,
            unit_cost: batchRow.unit_cost,
            total_cost: batchTotalCost,
          });
        }

        totalCost = round2(totalCost);
        const profit = round2(totalSales - totalCost);

        // Partial payment calculation
        const upfrontPaid = sale.amount_paid !== undefined ? parseFloat(String(sale.amount_paid)) : 0;
        const safePaid = isNaN(upfrontPaid) ? 0 : Math.max(0, Math.min(round2(upfrontPaid), totalSales));
        const paymentStatus = safePaid >= totalSales ? 'PAID' : (safePaid > 0 ? 'PARTIAL' : 'UNPAID');

        // Partial delivery calculation
        // Default to full delivery if undefined, or allow partial/zero delivery if specified
        const upfrontDelivered = sale.delivered_quantity !== undefined ? parseFloat(String(sale.delivered_quantity)) : qty;
        const safeDelivered = isNaN(upfrontDelivered) ? qty : Math.max(0, Math.min(round2(upfrontDelivered), qty));
        const deliveryStatus = safeDelivered >= qty ? 'DELIVERED' : (safeDelivered > 0 ? 'PARTIAL' : 'PENDING');

        // 1. Insert into sales
        const saleInsert = runQuery(
          'INSERT INTO sales (date, customer_id, quantity, selling_price, total_sales, total_cost, profit, amount_paid, payment_status, delivered_quantity, delivery_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [sale.date, sale.customer_id, qty, price, totalSales, totalCost, profit, safePaid, paymentStatus, safeDelivered, deliveryStatus]
        );
        const saleId = saleInsert.lastInsertRowid;

        // If delivered quantity > 0, log initial delivery record (saleId first, then date, qty, notes)
        if (safeDelivered > 0) {
          runQuery(
            'INSERT INTO sale_deliveries (sale_id, date, quantity, notes) VALUES (?, ?, ?, ?)',
            [saleId, sale.date, safeDelivered, sale.delivery_notes || (safeDelivered >= qty ? 'Full initial delivery' : `Partial initial delivery (${safeDelivered}/${qty})`)]
          );
        }

        // 2. Reduce stock, record sale_batch_details, and record Item Ledger stock out
        for (const vb of verifiedBatches) {
          // Reduce batch stock
          runQuery(
            'UPDATE stock_batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
            [vb.quantity, vb.batch_id]
          );

          // Sale batch detail
          runQuery(
            'INSERT INTO sale_batch_details (sale_id, batch_id, quantity, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?)',
            [saleId, vb.batch_id, vb.quantity, vb.unit_cost, vb.total_cost]
          );

          // Item Ledger Stock Out
          const lastItemLedger = queryOne<{ running_balance: number }>('SELECT running_balance FROM item_ledger ORDER BY id DESC LIMIT 1');
          const prevStockBal = lastItemLedger ? lastItemLedger.running_balance : 0;
          const newStockBal = round2(prevStockBal - vb.quantity);

          runQuery(
            'INSERT INTO item_ledger (date, transaction_type, reference, batch_id, stock_in, stock_out, running_balance) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [sale.date, 'SALE', `Sale #${saleId} (${customerName})`, vb.batch_id, 0, vb.quantity, newStockBal]
          );
        }

        // 3. Customer Ledger: Debit entry increases customer balance & pending units
        const lastCustLedger = queryOne<{ balance: number; pending_units: number }>(
          'SELECT balance, pending_units FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
          [sale.customer_id]
        );
        let currentCustBal = lastCustLedger ? lastCustLedger.balance : 0;
        currentCustBal = round2(currentCustBal + totalSales);

        let currentPendingUnits = lastCustLedger ? (lastCustLedger.pending_units || 0) : 0;
        const pendingForThisSale = round2(qty - safeDelivered);
        currentPendingUnits = round2(currentPendingUnits + pendingForThisSale);

        runQuery(
          'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            sale.customer_id,
            sale.date,
            'SALE',
            `Sale #${saleId}${safeDelivered > 0 ? ` (${safeDelivered}/${qty} delivered)` : ''}`,
            qty,
            price,
            totalSales,
            0,
            currentCustBal,
            safeDelivered,
            currentPendingUnits,
          ]
        );

        // 4. If partial/full upfront delivery was dispatched, record in customer ledger as DELIVERY
        if (safeDelivered > 0) {
          runQuery(
            'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              sale.customer_id,
              sale.date,
              'DELIVERY',
              `Initial Dispatch for Sale #${saleId} (${safeDelivered} units)`,
              0,
              price,
              0,
              0,
              currentCustBal,
              safeDelivered,
              currentPendingUnits,
            ]
          );
        }

        // 5. If partial/full upfront payment was made, record in collections and credit customer ledger immediately
        if (safePaid > 0) {
          const payMethod = sale.payment_method || 'Cash';
          const payNotes = sale.payment_notes ? ` - ${sale.payment_notes}` : '';
          
          runQuery(
            'INSERT INTO collections (customer_id, date, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?)',
            [sale.customer_id, sale.date, safePaid, payMethod, `Upfront payment for Sale #${saleId}${payNotes}`]
          );

          currentCustBal = round2(currentCustBal - safePaid);

          runQuery(
            'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              sale.customer_id,
              sale.date,
              'COLLECTION',
              `Payment for Sale #${saleId} (${payMethod})`,
              0,
              0,
              0,
              safePaid,
              currentCustBal,
              0,
              currentPendingUnits,
            ]
          );
        }

        createdSales.push({
          saleId,
          customer: customerName,
          quantity: qty,
          totalSales,
          amountPaid: safePaid,
          balanceDue: round2(totalSales - safePaid),
          paymentStatus,
          deliveredQuantity: safeDelivered,
          pendingQuantity: round2(qty - safeDelivered),
          deliveryStatus,
          totalCost,
          profit,
        });
      }

      commitTx();

      res.json({
        success: true,
        message: `${createdSales.length} sale(s) saved successfully. Stock, customer balances, collections, and deliveries updated automatically.`,
        data: createdSales,
      });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Record payment specifically against a sale
apiRouter.post('/sales/:id/payments', async (req: Request, res: Response) => {
  try {
    await getDb();
    const saleId = parseInt(req.params.id, 10);
    const { amount, date, payment_method, notes } = req.body;
    const numAmount = parseFloat(String(amount));

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Payment amount must be greater than 0' });
    }

    beginTx();
    try {
      const sale = queryOne<any>('SELECT * FROM sales WHERE id = ?', [saleId]);
      if (!sale) {
        throw new Error(`Sale #${saleId} not found`);
      }

      const prevPaid = sale.amount_paid || 0;
      const balanceDue = round2(sale.total_sales - prevPaid);
      if (balanceDue <= 0.005) {
        throw new Error(`Sale #${saleId} is already fully paid`);
      }

      const actualPayment = round2(Math.min(balanceDue, numAmount));
      const newAmountPaid = round2(prevPaid + actualPayment);
      const newPaymentStatus = newAmountPaid >= (sale.total_sales - 0.005) ? 'PAID' : 'PARTIAL';
      const payDate = date || new Date().toISOString().split('T')[0];
      const payMethod = (payment_method || 'Cash').trim();

      // 1. Update sale record
      runQuery(
        'UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ?',
        [newAmountPaid, newPaymentStatus, saleId]
      );

      // 2. Insert into collections
      const colNotes = notes ? `Sale #${saleId}: ${notes}` : `Payment for Sale #${saleId}`;
      runQuery(
        'INSERT INTO collections (customer_id, date, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?)',
        [sale.customer_id, payDate, actualPayment, payMethod, colNotes]
      );

      // 3. Credit customer ledger
      const lastCustLedger = queryOne<{ balance: number; pending_units: number }>(
        'SELECT balance, pending_units FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
        [sale.customer_id]
      );
      const prevBal = lastCustLedger ? lastCustLedger.balance : 0;
      const newBal = round2(prevBal - actualPayment);
      const curPendingUnits = lastCustLedger ? (lastCustLedger.pending_units || 0) : 0;

      runQuery(
        'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sale.customer_id, payDate, 'COLLECTION', `Payment for Sale #${saleId} (${payMethod})`, 0, 0, 0, actualPayment, newBal, 0, curPendingUnits]
      );

      commitTx();

      res.json({
        success: true,
        message: `Payment of $${actualPayment.toFixed(2)} recorded for Sale #${saleId}`,
        data: {
          sale_id: saleId,
          amount_paid: newAmountPaid,
          balance_due: round2(sale.total_sales - newAmountPaid),
          payment_status: newPaymentStatus,
        },
      });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Record delivery / product dispatch specifically against a sale
apiRouter.post('/sales/:id/deliveries', async (req: Request, res: Response) => {
  try {
    await getDb();
    const saleId = parseInt(req.params.id, 10);
    const { quantity, date, notes } = req.body;
    const numQty = parseFloat(String(quantity));

    if (isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ success: false, error: 'Delivered quantity must be greater than 0' });
    }

    beginTx();
    try {
      const sale = queryOne<any>('SELECT * FROM sales WHERE id = ?', [saleId]);
      if (!sale) {
        throw new Error(`Sale #${saleId} not found`);
      }

      const prevDelivered = sale.delivered_quantity || 0;
      const pendingQty = round2(sale.quantity - prevDelivered);

      if (pendingQty <= 0.005) {
        throw new Error(`Sale #${saleId} is already completely delivered`);
      }

      if (numQty > (pendingQty + 0.005)) {
        throw new Error(`Cannot deliver ${numQty} units. Only ${pendingQty} units are pending delivery for this sale.`);
      }

      const actualDeliveredQty = Math.min(pendingQty, numQty);
      const newDeliveredQty = round2(prevDelivered + actualDeliveredQty);
      const newDeliveryStatus = newDeliveredQty >= (sale.quantity - 0.005) ? 'DELIVERED' : 'PARTIAL';
      const deliveryDate = date || new Date().toISOString().split('T')[0];

      // 1. Update sale record
      runQuery(
        'UPDATE sales SET delivered_quantity = ?, delivery_status = ? WHERE id = ?',
        [newDeliveredQty, newDeliveryStatus, saleId]
      );

      // 2. Insert into sale_deliveries
      runQuery(
        'INSERT INTO sale_deliveries (sale_id, date, quantity, notes) VALUES (?, ?, ?, ?)',
        [saleId, deliveryDate, actualDeliveredQty, notes || `Delivered ${actualDeliveredQty} units`]
      );

      // 3. Record DELIVERY transaction in customer_ledger and decrement pending units
      const lastCustLedger = queryOne<{ balance: number; pending_units: number }>(
        'SELECT balance, pending_units FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
        [sale.customer_id]
      );
      const prevCustPending = lastCustLedger ? (lastCustLedger.pending_units || 0) : 0;
      const newCustPending = Math.max(0, round2(prevCustPending - actualDeliveredQty));
      const curCustBal = lastCustLedger ? lastCustLedger.balance : 0;

      runQuery(
        'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          sale.customer_id,
          deliveryDate,
          'DELIVERY',
          `Dispatch for Sale #${saleId} (${actualDeliveredQty} units dispatched)${notes ? ` - ${notes}` : ''}`,
          0,
          sale.selling_price,
          0,
          0,
          curCustBal,
          actualDeliveredQty,
          newCustPending,
        ]
      );

      commitTx();

      res.json({
        success: true,
        message: `Delivery of ${actualDeliveredQty} units recorded for Sale #${saleId}`,
        data: {
          sale_id: saleId,
          delivered_quantity: newDeliveredQty,
          pending_quantity: round2(sale.quantity - newDeliveredQty),
          delivery_status: newDeliveryStatus,
        },
      });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete a sale, revert allocated stock batches, and clean customer ledger/deliveries
apiRouter.delete('/sales/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const saleId = parseInt(req.params.id, 10);
    const sale = queryOne<any>('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (!sale) {
      return res.status(404).json({ success: false, error: `Sale #${saleId} not found` });
    }

    beginTx();
    try {
      // 1. Restore batch stock
      const batchDetails = queryAll<{ batch_id: number; quantity: number }>(
        'SELECT batch_id, quantity FROM sale_batch_details WHERE sale_id = ?',
        [saleId]
      );
      for (const bd of batchDetails) {
        runQuery('UPDATE stock_batches SET remaining_quantity = remaining_quantity + ? WHERE id = ?', [
          bd.quantity,
          bd.batch_id,
        ]);
      }

      // 2. Delete batch details
      runQuery('DELETE FROM sale_batch_details WHERE sale_id = ?', [saleId]);

      // 3. Delete sale deliveries
      runQuery('DELETE FROM sale_deliveries WHERE sale_id = ?', [saleId]);

      // 4. Delete item ledger records for this sale
      runQuery(
        "DELETE FROM item_ledger WHERE transaction_type = 'SALE' AND (reference LIKE ? OR reference = ?)",
        [`Sale #${saleId} (%`, `Sale #${saleId}`]
      );

      // 5. Delete customer ledger entries for this sale (and its deliveries/payments)
      runQuery(
        'DELETE FROM customer_ledger WHERE customer_id = ? AND (reference LIKE ? OR reference LIKE ? OR reference LIKE ? OR reference LIKE ?)',
        [
          sale.customer_id,
          `Sale #${saleId}%`,
          `Dispatch for Sale #${saleId}%`,
          `Initial Dispatch for Sale #${saleId}%`,
          `Payment for Sale #${saleId}%`,
        ]
      );

      // 6. Delete collections recorded explicitly for this sale if any
      runQuery(
        'DELETE FROM collections WHERE customer_id = ? AND (notes LIKE ? OR notes LIKE ?)',
        [sale.customer_id, `%Sale #${saleId}%`, `%Sale #${saleId}:%`]
      );

      // 7. Delete the sale itself
      runQuery('DELETE FROM sales WHERE id = ?', [saleId]);

      // 8. Recalculate customer ledger, sales payment allocations, and item ledger
      recalculateCustomerLedger(sale.customer_id);
      recalculateCustomerSalesPayments(sale.customer_id);
      recalculateItemLedger();

      commitTx();
      res.json({ success: true, message: `Sale #${saleId} deleted successfully and inventory restored` });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete an individual delivery/dispatch record
apiRouter.delete('/deliveries/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const deliveryId = parseInt(req.params.id, 10);
    const delivery = queryOne<any>('SELECT * FROM sale_deliveries WHERE id = ?', [deliveryId]);
    if (!delivery) {
      return res.status(404).json({ success: false, error: `Delivery #${deliveryId} not found` });
    }

    const sale = queryOne<any>('SELECT * FROM sales WHERE id = ?', [delivery.sale_id]);
    if (!sale) {
      return res.status(404).json({ success: false, error: `Associated sale #${delivery.sale_id} not found` });
    }

    beginTx();
    try {
      const newDelivered = Math.max(0, round2((sale.delivered_quantity || 0) - delivery.quantity));
      const newDeliveryStatus = newDelivered >= (sale.quantity - 0.005) ? 'DELIVERED' : (newDelivered > 0 ? 'PARTIAL' : 'PENDING');
      runQuery('UPDATE sales SET delivered_quantity = ?, delivery_status = ? WHERE id = ?', [
        newDelivered,
        newDeliveryStatus,
        sale.id,
      ]);

      // Delete from customer ledger
      runQuery(
        "DELETE FROM customer_ledger WHERE customer_id = ? AND transaction_type = 'DELIVERY' AND reference LIKE ? AND delivered_quantity = ?",
        [sale.customer_id, `%Sale #${sale.id}%`, delivery.quantity]
      );

      // Delete delivery record
      runQuery('DELETE FROM sale_deliveries WHERE id = ?', [deliveryId]);

      recalculateCustomerLedger(sale.customer_id);
      commitTx();

      res.json({ success: true, message: `Delivery of ${delivery.quantity} units deleted successfully` });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. DAILY COLLECTION ENTRY (Supports multiple collections in one go!)
apiRouter.get('/collections', async (_req: Request, res: Response) => {
  try {
    await getDb();
    const collections = queryAll(`
      SELECT 
        col.id, 
        col.date, 
        col.customer_id, 
        c.name as customer_name, 
        col.amount, 
        col.payment_method, 
        col.notes
      FROM collections col
      JOIN customers c ON col.customer_id = c.id
      ORDER BY col.id DESC
    `);
    res.json({ success: true, data: collections });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

interface CollectionInput {
  customer_id: number;
  date: string;
  amount: number;
  payment_method: string;
  notes?: string;
}

apiRouter.post('/collections', async (req: Request, res: Response) => {
  try {
    await getDb();
    const colsInput: CollectionInput[] = Array.isArray(req.body.collections) ? req.body.collections : [req.body];

    if (!colsInput.length) {
      return res.status(400).json({ success: false, error: 'No collections provided to save' });
    }

    // Validation
    for (let i = 0; i < colsInput.length; i++) {
      const col = colsInput[i];
      const prefix = colsInput.length > 1 ? `Collection row #${i + 1}: ` : '';

      if (!col.customer_id) return res.status(400).json({ success: false, error: `${prefix}Customer is required` });
      if (!col.date) return res.status(400).json({ success: false, error: `${prefix}Date is required` });

      const amt = parseFloat(String(col.amount));
      if (isNaN(amt) || amt <= 0) return res.status(400).json({ success: false, error: `${prefix}Amount must be greater than 0` });
    }

    beginTx();

    try {
      const savedCollections: any[] = [];

      for (const col of colsInput) {
        const amt = round2(parseFloat(String(col.amount)));
        const method = (col.payment_method || 'Cash').trim();
        const notes = (col.notes || '').trim();

        // 1. Insert into collections
        const colRes = runQuery(
          'INSERT INTO collections (customer_id, date, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?)',
          [col.customer_id, col.date, amt, method, notes]
        );
        const colId = colRes.lastInsertRowid;

        // 2. Customer Ledger: Credit entry reduces customer outstanding
        const lastCustLedger = queryOne<{ balance: number; pending_units: number }>(
          'SELECT balance, pending_units FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
          [col.customer_id]
        );
        const prevBal = lastCustLedger ? lastCustLedger.balance : 0;
        const newBal = round2(prevBal - amt);
        const curCustPending = lastCustLedger ? (lastCustLedger.pending_units || 0) : 0;

        runQuery(
          'INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [col.customer_id, col.date, 'COLLECTION', `Collection #${colId} (${method})`, 0, 0, 0, amt, newBal, 0, curCustPending]
        );

        // 3. FIFO auto-allocate payment to customer's open sales so sales balances remain accurate
        const unpaidSales = queryAll<{ id: number; total_sales: number; amount_paid: number }>(
          "SELECT id, total_sales, COALESCE(amount_paid, 0) as amount_paid FROM sales WHERE customer_id = ? AND (payment_status != 'PAID' OR amount_paid < total_sales) ORDER BY id ASC",
          [col.customer_id]
        );

        let remAmt = amt;
        for (const us of unpaidSales) {
          if (remAmt <= 0) break;
          const due = round2(us.total_sales - us.amount_paid);
          if (due <= 0.005) continue;

          const alloc = Math.min(due, remAmt);
          const updatedPaid = round2(us.amount_paid + alloc);
          const updatedStatus = updatedPaid >= (us.total_sales - 0.005) ? 'PAID' : 'PARTIAL';

          runQuery(
            'UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ?',
            [updatedPaid, updatedStatus, us.id]
          );

          remAmt = round2(remAmt - alloc);
        }

        savedCollections.push({ id: colId, customer_id: col.customer_id, amount: amt, newBalance: newBal });
      }

      commitTx();

      res.json({
        success: true,
        message: `${savedCollections.length} collection(s) recorded successfully and credited to customer account(s)`,
        data: savedCollections,
      });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete an individual collection / payment record
apiRouter.delete('/collections/:id', async (req: Request, res: Response) => {
  try {
    await getDb();
    const collectionId = parseInt(req.params.id, 10);
    const collection = queryOne<any>('SELECT * FROM collections WHERE id = ?', [collectionId]);
    if (!collection) {
      return res.status(404).json({ success: false, error: `Collection #${collectionId} not found` });
    }

    beginTx();
    try {
      // Delete from customer_ledger
      runQuery(
        "DELETE FROM customer_ledger WHERE customer_id = ? AND transaction_type = 'COLLECTION' AND (reference LIKE ? OR (credit = ? AND date = ?))",
        [collection.customer_id, `%Collection #${collectionId}%`, collection.amount, collection.date]
      );

      // Delete the collection
      runQuery('DELETE FROM collections WHERE id = ?', [collectionId]);

      // Recalculate customer ledger and sales payment allocations
      recalculateCustomerLedger(collection.customer_id);
      recalculateCustomerSalesPayments(collection.customer_id);
      commitTx();

      res.json({ success: true, message: `Collection #${collectionId} of $${collection.amount.toFixed(2)} deleted successfully` });
    } catch (txErr: any) {
      rollbackTx();
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. ITEM LEDGER
apiRouter.get('/item-ledger', async (req: Request, res: Response) => {
  try {
    await getDb();
    const { startDate, endDate, type, batch_id } = req.query;

    let sql = `
      SELECT 
        il.id, 
        il.date, 
        il.transaction_type, 
        il.reference, 
        il.batch_id, 
        sb.batch_number,
        sb.unit_cost,
        il.stock_in, 
        il.stock_out, 
        il.running_balance
      FROM item_ledger il
      LEFT JOIN stock_batches sb ON il.batch_id = sb.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      sql += ' AND il.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND il.date <= ?';
      params.push(endDate);
    }
    if (type && type !== 'ALL') {
      sql += ' AND il.transaction_type = ?';
      params.push(type);
    }
    if (batch_id && batch_id !== 'ALL') {
      sql += ' AND il.batch_id = ?';
      params.push(batch_id);
    }

    sql += ' ORDER BY il.id ASC';

    const entries = queryAll(sql, params);

    // Totals in filtered set
    let totalStockIn = 0;
    let totalStockOut = 0;
    entries.forEach(e => {
      totalStockIn += e.stock_in;
      totalStockOut += e.stock_out;
    });

    const latest = queryOne<{ running_balance: number }>('SELECT running_balance FROM item_ledger ORDER BY id DESC LIMIT 1');
    const currentStock = latest ? latest.running_balance : 0;

    res.json({
      success: true,
      data: {
        entries,
        summary: {
          totalStockIn: round2(totalStockIn),
          totalStockOut: round2(totalStockOut),
          currentStock: round2(currentStock),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. STOCK BALANCE REPORT
apiRouter.get('/reports/stock-balance', async (req: Request, res: Response) => {
  try {
    await getDb();
    const { startDate, endDate, batch_id } = req.query;

    // 1. Opening stock calculation (Stock In - Stock Out before startDate)
    let openingStock = 0;
    if (startDate) {
      const opRow = queryOne<{ in_sum: number; out_sum: number }>(`
        SELECT 
          COALESCE(SUM(stock_in), 0) as in_sum,
          COALESCE(SUM(stock_out), 0) as out_sum
        FROM item_ledger
        WHERE date < ?
      `, [startDate]);
      if (opRow) {
        openingStock = round2(opRow.in_sum - opRow.out_sum);
      }
    }

    // 2. Purchased & Sold during period
    let periodQuery = 'SELECT COALESCE(SUM(stock_in), 0) as purchased, COALESCE(SUM(stock_out), 0) as sold FROM item_ledger WHERE 1=1';
    const periodParams: any[] = [];

    if (startDate) {
      periodQuery += ' AND date >= ?';
      periodParams.push(startDate);
    }
    if (endDate) {
      periodQuery += ' AND date <= ?';
      periodParams.push(endDate);
    }

    const periodRow = queryOne<{ purchased: number; sold: number }>(periodQuery, periodParams) || { purchased: 0, sold: 0 };
    const totalPurchased = round2(periodRow.purchased);
    const totalSold = round2(periodRow.sold);
    const closingStock = round2(openingStock + totalPurchased - totalSold);

    // 3. Batch-wise breakdown
    let batchQuery = `
      SELECT 
        sb.id,
        sb.batch_number, 
        sb.purchase_date, 
        sb.original_quantity as purchased_qty, 
        ROUND(sb.original_quantity - sb.remaining_quantity, 2) as sold_qty, 
        sb.remaining_quantity as remaining_qty, 
        sb.unit_cost, 
        ROUND(sb.remaining_quantity * sb.unit_cost, 2) as remaining_value
      FROM stock_batches sb
      WHERE 1=1
    `;
    const bParams: any[] = [];
    if (batch_id && batch_id !== 'ALL') {
      batchQuery += ' AND sb.id = ?';
      bParams.push(batch_id);
    }
    if (startDate) {
      batchQuery += ' AND sb.purchase_date >= ?';
      bParams.push(startDate);
    }
    if (endDate) {
      batchQuery += ' AND sb.purchase_date <= ?';
      bParams.push(endDate);
    }
    batchQuery += ' ORDER BY sb.id DESC';

    const batches = queryAll(batchQuery, bParams);

    // Stock value & average purchase cost of current inventory
    const allStockBatches = queryAll<{ remaining_quantity: number; unit_cost: number }>('SELECT remaining_quantity, unit_cost FROM stock_batches');
    let totalStockQty = 0;
    let totalStockVal = 0;
    allStockBatches.forEach(b => {
      if (b.remaining_quantity > 0) {
        totalStockQty += b.remaining_quantity;
        totalStockVal += (b.remaining_quantity * b.unit_cost);
      }
    });

    const averagePurchaseCost = totalStockQty > 0 ? round2(totalStockVal / totalStockQty) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          openingStock,
          totalPurchased,
          totalSold,
          closingStock,
          totalStockValue: round2(totalStockVal),
          averagePurchaseCost,
        },
        batches,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. PROFIT REPORT
apiRouter.get('/reports/profit', async (req: Request, res: Response) => {
  try {
    await getDb();
    const { filterType, startDate, endDate, customerId } = req.query;

    const today = new Date().toISOString().split('T')[0];
    let start = startDate as string;
    let end = endDate as string;

    if (filterType === 'today') {
      start = today;
      end = today;
    } else if (filterType === 'this_month') {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    let sql = `
      SELECT 
        s.id, 
        s.date, 
        s.customer_id, 
        c.name as customer_name, 
        s.quantity, 
        s.selling_price, 
        s.total_sales, 
        s.total_cost, 
        s.profit,
        ROUND((s.profit / NULLIF(s.total_sales, 0)) * 100, 1) as margin_percent
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (start) {
      sql += ' AND s.date >= ?';
      params.push(start);
    }
    if (end) {
      sql += ' AND s.date <= ?';
      params.push(end);
    }
    if (customerId && customerId !== 'ALL') {
      sql += ' AND s.customer_id = ?';
      params.push(customerId);
    }

    sql += ' ORDER BY s.date DESC, s.id DESC';

    const sales = queryAll(sql, params);

    // Attach batch details used
    const saleBatchDetails = queryAll(`
      SELECT 
        sbd.sale_id, 
        sbd.batch_id, 
        sb.batch_number, 
        sbd.quantity, 
        sbd.unit_cost, 
        sbd.total_cost
      FROM sale_batch_details sbd
      JOIN stock_batches sb ON sbd.batch_id = sb.id
    `);
    const batchDetailMap = new Map<number, any[]>();
    const batchStringMap = new Map<number, string[]>();

    saleBatchDetails.forEach(d => {
      if (!batchDetailMap.has(d.sale_id)) batchDetailMap.set(d.sale_id, []);
      if (!batchStringMap.has(d.sale_id)) batchStringMap.set(d.sale_id, []);

      batchDetailMap.get(d.sale_id)!.push(d);
      batchStringMap.get(d.sale_id)!.push(`${d.batch_number}: ${d.quantity} @ cost ${d.unit_cost.toFixed(2)}`);
    });

    let totalSales = 0;
    let totalPurchaseCost = 0;
    let totalProfit = 0;
    let totalQuantitySold = 0;

    const formattedSales = sales.map(s => {
      totalSales += s.total_sales;
      totalPurchaseCost += s.total_cost;
      totalProfit += s.profit;
      totalQuantitySold += s.quantity;

      const rawDetails = batchDetailMap.get(s.id) || [];
      const batchDetails = rawDetails.map(d => {
        const batchSales = round2(d.quantity * s.selling_price);
        const batchCost = round2(d.total_cost || d.quantity * d.unit_cost);
        const batchProfit = round2(batchSales - batchCost);
        const batchMargin = batchSales > 0 ? round2((batchProfit / batchSales) * 100) : 0;
        return {
          batch_id: d.batch_id,
          batch_number: d.batch_number,
          quantity: d.quantity,
          unit_cost: d.unit_cost,
          total_cost: batchCost,
          total_sales: batchSales,
          profit: batchProfit,
          margin_percent: batchMargin,
        };
      });

      return {
        ...s,
        batchesUsed: (batchStringMap.get(s.id) || []).join(', '),
        batchDetails,
      };
    });

    totalSales = round2(totalSales);
    totalPurchaseCost = round2(totalPurchaseCost);
    totalProfit = round2(totalProfit);
    totalQuantitySold = round2(totalQuantitySold);
    const overallMarginPercent = totalSales > 0 ? round2((totalProfit / totalSales) * 100) : 0;
    const averageSellingPrice = totalQuantitySold > 0 ? round2(totalSales / totalQuantitySold) : 0;
    const averagePurchaseCost = totalQuantitySold > 0 ? round2(totalPurchaseCost / totalQuantitySold) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalSales,
          totalPurchaseCost,
          totalProfit,
          overallMarginPercent,
          totalQuantitySold,
          averageSellingPrice,
          averagePurchaseCost,
        },
        sales: formattedSales,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
