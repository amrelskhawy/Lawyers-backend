import cron from "node-cron";
import { ReminderService } from "../../../modules/reminders/reminders.service.js";
import logger from "../../utils/logger.js";

const reminderService = new ReminderService();
let running = false;

/**
 * Poll for due reminders every minute and send them. Guards against overlapping
 * runs with the `running` flag (a slow batch must not be re-entered).
 */
export function startReminderCron() {
    cron.schedule("* * * * *", async () => {
        if (running) return;
        running = true;
        try {
            const { processed } = await reminderService.processDueReminders();
            if (processed > 0) logger.success(`[reminders] processed ${processed} due reminder(s)`);
        } catch (err: any) {
            logger.error("[reminders] cron run failed", err?.message ?? String(err));
        } finally {
            running = false;
        }
    });
    logger.success("Reminder cron scheduled (every minute)");
}
