import { acquireLock } from "../../lib/redis-lock.js";
import { logger } from "../../lib/logger.js";
import { sendWeeklyReminderEmail } from "../auth/mailer.js";
import { notificationsRepository } from "./notifications.repository.js";

/** Sunday from 09:00 UTC: 18:00 in Japan, morning in Europe. */
export const WEEKLY_EMAIL_DAY_UTC = 0;
export const WEEKLY_EMAIL_HOUR_UTC = 9;
const CHECK_EVERY_MS = 15 * 60 * 1000;
// Anyone sent one in the last six days is skipped, so a run late on
// Sunday, or a restart, never sends twice in a week.
const MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;

export function isWeeklyEmailWindow(now: Date): boolean {
  return now.getUTCDay() === WEEKLY_EMAIL_DAY_UTC && now.getUTCHours() >= WEEKLY_EMAIL_HOUR_UTC;
}

/**
 * Sends the weekly reminder to everyone due. The email carries nothing
 * from anyone's record, and the log carries counts only, never an
 * address.
 */
export async function runWeeklyEmails(now = new Date()): Promise<{ due: number; sent: number }> {
  const sentBefore = new Date(now.getTime() - MIN_GAP_MS);
  const due = await notificationsRepository.listDueForWeeklyEmail(sentBefore);
  let sent = 0;
  for (const user of due) {
    if (!(await notificationsRepository.claimWeeklyEmail(user.id, sentBefore, now))) continue;
    // The mailer logs a failed send and never throws; the claim stands,
    // so a failure costs that one week rather than risking a repeat.
    await sendWeeklyReminderEmail(user.email, user.weeklyEmailLocale ?? undefined);
    sent += 1;
  }
  return { due: due.length, sent };
}

async function tick() {
  if (!isWeeklyEmailWindow(new Date())) return;
  // One run at a time across servers; the per person claim above is the
  // real guarantee, this only avoids wasted work.
  const lock = await acquireLock("weekly-email", 10 * 60 * 1000);
  if (lock.status === "held") return;
  try {
    const result = await runWeeklyEmails();
    if (result.due > 0) logger.info(result, "weekly email run");
  } catch (err) {
    logger.error({ err }, "weekly email run failed");
  } finally {
    if (lock.status === "acquired") await lock.release();
  }
}

/** Checks every 15 minutes; returns a stop function for shutdown. */
export function startWeeklyEmailScheduler(): () => void {
  const timer = setInterval(() => void tick(), CHECK_EVERY_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
