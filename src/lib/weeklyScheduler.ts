import { archiveAndResetInventory, getWeekPeriodInfo } from './archiveResetService';
import { getDb } from './database';

const globalForScheduler = globalThis as unknown as {
  __bgcSchedulerStarted?: boolean;
  __bgcSchedulerTimer?: NodeJS.Timeout;
};

export function checkAndRunWeeklySundayReset(): void {
  try {
    const now = new Date();
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

export function ensureWeeklyScheduler(): void {
  if (globalForScheduler.__bgcSchedulerStarted) return;
  globalForScheduler.__bgcSchedulerStarted = true;
  checkAndRunWeeklySundayReset();
  globalForScheduler.__bgcSchedulerTimer = setInterval(checkAndRunWeeklySundayReset, 15 * 60 * 1000);
}
