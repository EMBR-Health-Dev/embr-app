import { prisma } from "../../lib/prisma.js";

export const notificationsRepository = {
  async getWeeklyEmail(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyEmailOptIn: true },
    });
    return user?.weeklyEmailOptIn ?? false;
  },

  async setWeeklyEmail(userId: string, enabled: boolean): Promise<boolean> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { weeklyEmailOptIn: enabled },
      select: { weeklyEmailOptIn: true },
    });
    return user.weeklyEmailOptIn;
  },

  /** Verified, opted in, and not sent one since `sentBefore`. Ids and
   * emails only. */
  listDueForWeeklyEmail(sentBefore: Date) {
    return prisma.user.findMany({
      where: {
        weeklyEmailOptIn: true,
        emailVerifiedAt: { not: null },
        OR: [{ weeklyEmailLastSentAt: null }, { weeklyEmailLastSentAt: { lt: sentBefore } }],
      },
      select: { id: true, email: true },
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
