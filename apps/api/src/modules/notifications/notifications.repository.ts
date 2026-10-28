import { prisma } from "../../lib/prisma.js";
import type { Locale } from "../../lib/locale.js";

export const notificationsRepository = {
  async getWeeklyEmail(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyEmailOptIn: true },
    });
    return user?.weeklyEmailOptIn ?? false;
  },

  /** Stores the language to send it in while it is on, and nothing
   * once it is off. */
  async setWeeklyEmail(userId: string, enabled: boolean, locale: Locale): Promise<boolean> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { weeklyEmailOptIn: enabled, weeklyEmailLocale: enabled ? locale : null },
      select: { weeklyEmailOptIn: true },
    });
    return user.weeklyEmailOptIn;
  },

  /** Verified, opted in, and not sent one since `sentBefore`. Ids,
   * emails and the language to send in only. */
  listDueForWeeklyEmail(sentBefore: Date) {
    return prisma.user.findMany({
      where: {
        weeklyEmailOptIn: true,
        emailVerifiedAt: { not: null },
        OR: [{ weeklyEmailLastSentAt: null }, { weeklyEmailLastSentAt: { lt: sentBefore } }],
      },
      select: { id: true, email: true, weeklyEmailLocale: true },
      orderBy: { id: "asc" },
    });
  },

  /**
   * Claims this week's email for one person in a single conditional
   * write, so two runs (two servers, or a restart mid run) can never
   * both send it. True only for the run that made the claim.
   */
  async claimWeeklyEmail(userId: string, sentBefore: Date, now: Date): Promise<boolean> {
    const { count } = await prisma.user.updateMany({
      where: {
        id: userId,
        weeklyEmailOptIn: true,
        OR: [{ weeklyEmailLastSentAt: null }, { weeklyEmailLastSentAt: { lt: sentBefore } }],
      },
      data: { weeklyEmailLastSentAt: now },
    });
    return count === 1;
  },
};
