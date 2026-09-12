export const PAGE_ROLE_LABEL: Record<string, string> = {
  MANAGER: 'مديرة الصفحة',
  ADMIN: 'مشرفة',
  AGENT: 'موظفة مبيعات',
};

export const EMPLOYMENT_LABEL: Record<string, string> = {
  NONE: 'بدون احتساب',
  SALARY: 'مرتب شهري',
  COMMISSION: 'عمولة',
};

export type PageSummary = {
  id: string;
  name: string;
  publicCode: number;
  status: string;
  notes?: string | null;
  pageId?: string | null;
  employeeCount: number;
  orderCount: number;
  ordersToday: number;
  ordersMonth: number;
  deliveredCount: number;
  cancelledOrReturned: number;
  salesDelivered: number;
  lastOrder?: {
    id: string;
    orderNumber: string;
    createdAt: string;
    status: string;
    totalAmount: string | number;
  } | null;
};

export function periodPreset(preset: 'today' | 'week' | 'month'): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (preset === 'week') {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
