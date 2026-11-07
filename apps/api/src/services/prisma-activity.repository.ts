import type { PrismaClient } from '@accesslens-ai/database';
import type { ActivityRepository } from '../modules/activity/activity.repository.js';

export class PrismaActivityRepository implements ActivityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listNotifications(userId: string, skip: number, take: number) {
    const where = { userId };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } })
    ]);
    return { items, total, unread };
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { read: true } });
    return result.count === 1;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return result.count;
  }

  async listActivity(userId: string, skip: number, take: number) {
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.activityLog.count({ where })
    ]);
    return { items, total };
  }
}
