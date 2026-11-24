import { archiveAndResetInventory, getWeekPeriodInfo } from './archiveResetService';
import { getDb } from '../db/database';

let schedulerTimer: NodeJS.Timeout | null = null;

export function checkAndRunWeeklySundayReset(): void {
  try {
    const now = new Date();
    // 0 = Sunday
    if (now.getDay() !== 0) {
      return;
    }

    const { weekKey, periodLabel } = getWeekPeriodInfo(now);
    const db = getDb();
    const alreadyRan = db
      .prepare('SELECT id FROM inventory_history_archives WHERE archive_ref = ?')
      .get(weekKey);

    if (alreadyRan) {
      return;
    }

    const result = archiveAndResetInventory({
      triggerType: 'Weekly Sunday Reset',
      performedById: null,
      performedByName: 'System Weekly Scheduler',
      archiveRef: weekKey,
      periodLabel,
    });

    if (!result.skippedEmpty && !result.alreadyArchived) {
      console.log(
        `[BGCyouth Scheduler] Weekly Sunday Reset completed (${weekKey}): archived ${result.archivedItemCount} item(s).`
      );
    }
  } catch (err) {
    console.error('[BGCyouth Scheduler] Weekly Sunday Reset failed (inventory preserved):', err);
  }
}

export function startWeeklyScheduler(): void {
  // Run check on startup, then every 15 minutes
  checkAndRunWeeklySundayReset();
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(checkAndRunWeeklySundayReset, 15 * 60 * 1000);
}
