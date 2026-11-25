import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';
import { ensureWeeklyScheduler } from '@/lib/weeklyScheduler';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;
  ensureWeeklyScheduler();

  const db = getDb();
  const inventoryStats = db
    .prepare(`
      SELECT
        COUNT(*) AS total_items,
        COALESCE(SUM(quantity), 0) AS total_units,
        COALESCE(SUM(total_value), 0) AS total_value,
        COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count,
        COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END), 0) AS low_stock_count
      FROM inventory_items
    `)
    .get() as any;

  const categoryBreakdown = db
    .prepare(`
      SELECT category, COUNT(*) AS item_count, COALESCE(SUM(quantity), 0) AS total_units, COALESCE(SUM(total_value), 0) AS total_value
      FROM inventory_items
      GROUP BY category
      ORDER BY total_value DESC
    `)
    .all();

  const auditStats = db
    .prepare(`
      SELECT
        COUNT(*) AS total_audits,
        COALESCE(SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed_audits,
        COALESCE(SUM(CASE WHEN status != 'Completed' THEN 1 ELSE 0 END), 0) AS pending_audits
      FROM audits
    `)
    .get() as any;

  const discrepancyStats = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ai.discrepancy < 0 THEN 1 ELSE 0 END), 0) AS shortage_items,
        COALESCE(SUM(CASE WHEN ai.discrepancy > 0 THEN 1 ELSE 0 END), 0) AS excess_items,
        COALESCE(SUM(CASE WHEN ai.discrepancy < 0 THEN ai.financial_difference ELSE 0 END), 0) AS shortage_value,
        COALESCE(SUM(CASE WHEN ai.discrepancy > 0 THEN ai.financial_difference ELSE 0 END), 0) AS excess_value,
        COALESCE(SUM(ai.financial_difference), 0) AS net_financial_difference
      FROM audit_items ai
      JOIN audits a ON a.id = ai.audit_id
      WHERE a.status = 'Completed'
    `)
    .get() as any;

  const recentItems = db
    .prepare(
      'SELECT id, item_name, category, quantity, unit, total_value, created_at FROM inventory_items ORDER BY id DESC LIMIT 10'
    )
    .all();

  const recentAudits = db
    .prepare('SELECT id, audit_ref, title, audit_date, auditor_name, status FROM audits ORDER BY id DESC LIMIT 5')
    .all();

  const recentActivities = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 12').all();

  const lowStockItems = db
    .prepare(`
      SELECT id, item_code, item_name, category, quantity, unit, min_stock_level
      FROM inventory_items
      WHERE quantity <= min_stock_level
      ORDER BY quantity ASC
      LIMIT 8
    `)
    .all();

  return NextResponse.json({
    inventory: inventoryStats,
    categoryBreakdown,
    audits: auditStats,
    discrepancies: discrepancyStats,
    recentItems,
    recentAudits,
    recentActivities,
    lowStockItems,
  });
}
