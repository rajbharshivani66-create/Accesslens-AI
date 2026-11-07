export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  createdAt: Date;
}

export interface ActivityRepository {
  listNotifications(userId: string, skip: number, take: number): Promise<{ items: NotificationItem[]; total: number; unread: number }>;
  markNotificationRead(userId: string, notificationId: string): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<number>;
  listActivity(userId: string, skip: number, take: number): Promise<{ items: ActivityItem[]; total: number }>;
}
