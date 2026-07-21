'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { FixedExpense, ExpensePayment, ExpenseCategory, ExpenseFrequency } from '@/types/expense';
import {
  alertLevel,
  calculateNextDueDate,
} from '@/types/expense';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useFixedExpenses() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const expenses = await db.fixedExpenses
      .where('clinicId')
      .equals(clinicId)
      .filter((g) => !g.deletedAt)
      .toArray();
    return expenses.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }, []);

  return { expenses: result ?? [], loading: result === undefined };
}

export function useExpensePayments() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    return db.expensePayments
      .where('clinicId')
      .equals(clinicId)
      .toArray();
  }, []);

  return { payments: result ?? [], loading: result === undefined };
}

export function useExpenseAlerts() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const expenses = await db.fixedExpenses
      .where('clinicId')
      .equals(clinicId)
      .filter((g) => !g.deletedAt && g.active)
      .toArray();

    let overdue  = 0;
    let urgent   = 0;
    let upcoming = 0;

    for (const g of expenses) {
      const level = alertLevel(g.nextDueDate);
      if (level === 'overdue')  overdue++;
      else if (level === 'urgent')   urgent++;
      else if (level === 'upcoming') upcoming++;
    }

    return { total: overdue + urgent + upcoming, overdue, urgent, upcoming };
  }, []);

  return result ?? { total: 0, overdue: 0, urgent: 0, upcoming: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function calcFirstDueDate(paymentDay: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year  = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  const lastDayThisMonth = new Date(year, month + 1, 0).getDate();
  const effectiveDay     = Math.min(paymentDay, lastDayThisMonth);
  const thisMonthDate    = new Date(year, month, effectiveDay);

  if (thisMonthDate >= today) {
    return thisMonthDate.toISOString().slice(0, 10);
  }

  // Already passed — use next month
  const nextMonth    = month + 1;
  const nextYear     = nextMonth > 11 ? year + 1 : year;
  const adjMonth     = nextMonth % 12;
  const lastDayNext  = new Date(nextYear, adjMonth + 1, 0).getDate();
  const effectiveNext = Math.min(paymentDay, lastDayNext);
  return new Date(nextYear, adjMonth, effectiveNext).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateFixedExpenseInput {
  name:       string;
  amount:     number;
  category:   ExpenseCategory;
  frequency:  ExpenseFrequency;
  paymentDay: number;
}

export async function createFixedExpense(input: CreateFixedExpenseInput): Promise<string> {
  const now      = Date.now();
  const id       = crypto.randomUUID();
  const clinicId = await getClinicaId();

  const expense: FixedExpense = {
    id,
    clinicId,
    name:        input.name,
    amount:      input.amount,
    category:    input.category,
    frequency:   input.frequency,
    paymentDay:  input.paymentDay,
    nextDueDate: calcFirstDueDate(input.paymentDay),
    active:      true,
    syncStatus:  'pending',
    createdAt:   now,
    updatedAt:   now,
  };

  await db.fixedExpenses.add(expense);
  await encolarSync({ collection: 'fixedExpenses', documentId: id, operation: 'create', data: expense, attempts: 0, createdAt: now });
  return id;
}

export async function updateFixedExpense(
  id: string,
  data: Partial<Pick<FixedExpense, 'name' | 'amount' | 'category' | 'frequency' | 'paymentDay'>>,
): Promise<void> {
  const now     = Date.now();
  const updates: Partial<FixedExpense> = { ...data, syncStatus: 'pending', updatedAt: now };

  if (data.paymentDay !== undefined) {
    const existing = await db.fixedExpenses.get(id);
    if (existing) updates.nextDueDate = calcFirstDueDate(data.paymentDay);
  }

  await db.fixedExpenses.update(id, updates);
  await encolarSync({ collection: 'fixedExpenses', documentId: id, operation: 'update', data: { id, ...updates }, attempts: 0, createdAt: now });
}

export async function deleteFixedExpense(id: string): Promise<void> {
  const now             = Date.now();
  const linkedPayments  = await db.expensePayments.where('fixedExpenseId').equals(id).toArray();

  await db.transaction('rw', [db.fixedExpenses, db.expensePayments, db.syncQueue], async () => {
    await db.fixedExpenses.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });

    for (const payment of linkedPayments) {
      await db.expensePayments.update(payment.id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
      await db.syncQueue.add({ collection: 'expensePayments', documentId: payment.id, operation: 'delete', data: { id: payment.id, deletedAt: now, updatedAt: now }, attempts: 0, createdAt: now } as SyncQueueItem);
    }

    await db.syncQueue.add({ collection: 'fixedExpenses', documentId: id, operation: 'delete', data: { id, deletedAt: now, updatedAt: now }, attempts: 0, createdAt: now } as SyncQueueItem);
  });
}

export async function markAsPaid(
  fixedExpenseId: string,
  amount:         number,
  paymentDate:    string,
  notes?:         string,
): Promise<void> {
  const now      = Date.now();
  const clinicId = await getClinicaId();

  const expense = await db.fixedExpenses.get(fixedExpenseId);
  if (!expense) throw new Error('Fixed expense not found');

  const paymentId = crypto.randomUUID();
  const payment: ExpensePayment = {
    id:             paymentId,
    clinicId,
    fixedExpenseId,
    amount,
    paymentDate,
    notes,
    syncStatus:     'pending',
    createdAt:      now,
    updatedAt:      now,
  };

  const nextDueDate   = calculateNextDueDate(expense.nextDueDate, expense.frequency, expense.paymentDay);
  const expenseUpdates = { nextDueDate, updatedAt: now, syncStatus: 'pending' as const };

  await db.transaction('rw', [db.fixedExpenses, db.expensePayments, db.syncQueue], async () => {
    await db.expensePayments.add(payment);
    await db.fixedExpenses.update(fixedExpenseId, expenseUpdates);
    await db.syncQueue.add({ collection: 'expensePayments', documentId: paymentId, operation: 'create', data: payment, attempts: 0, createdAt: now } as SyncQueueItem);
    await db.syncQueue.add({ collection: 'fixedExpenses', documentId: fixedExpenseId, operation: 'update', data: { id: fixedExpenseId, ...expenseUpdates }, attempts: 0, createdAt: now } as SyncQueueItem);
  });
}

export async function toggleExpenseActive(id: string): Promise<void> {
  const now     = Date.now();
  const expense = await db.fixedExpenses.get(id);
  if (!expense) return;
  const updates = { active: !expense.active, updatedAt: now, syncStatus: 'pending' as const };
  await db.fixedExpenses.update(id, updates);
  await encolarSync({ collection: 'fixedExpenses', documentId: id, operation: 'update', data: { id, ...updates }, attempts: 0, createdAt: now });
}
