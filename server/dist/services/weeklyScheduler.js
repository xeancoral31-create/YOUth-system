"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndRunWeeklySundayReset = checkAndRunWeeklySundayReset;
exports.startWeeklyScheduler = startWeeklyScheduler;
const archiveResetService_1 = require("./archiveResetService");
const database_1 = require("../db/database");
let schedulerTimer = null;
function checkAndRunWeeklySundayReset() {
    try {
        const now = new Date();
        // 0 = Sunday
        if (now.getDay() !== 0) {
            return;
        }
        const { weekKey, periodLabel } = (0, archiveResetService_1.getWeekPeriodInfo)(now);
        const db = (0, database_1.getDb)();
        const alreadyRan = db
            .prepare('SELECT id FROM inventory_history_archives WHERE archive_ref = ?')
            .get(weekKey);
        if (alreadyRan) {
            return;
        }
        const result = (0, archiveResetService_1.archiveAndResetInventory)({
            triggerType: 'Weekly Sunday Reset',
            performedById: null,
            performedByName: 'System Weekly Scheduler',
            archiveRef: weekKey,
            periodLabel,
        });
        if (!result.skippedEmpty && !result.alreadyArchived) {
            console.log(`[BGCyouth Scheduler] Weekly Sunday Reset completed (${weekKey}): archived ${result.archivedItemCount} item(s).`);
        }
    }
    catch (err) {
        console.error('[BGCyouth Scheduler] Weekly Sunday Reset failed (inventory preserved):', err);
    }
}
function startWeeklyScheduler() {
    // Run check on startup, then every 15 minutes
    checkAndRunWeeklySundayReset();
    if (schedulerTimer)
        clearInterval(schedulerTimer);
    schedulerTimer = setInterval(checkAndRunWeeklySundayReset, 15 * 60 * 1000);
}
