'use client';

import { useEffect, useRef } from 'react';
import { db } from '@/lib/db/database';

// ── Service Worker ────────────────────────────────────────────────────────────

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

// ── Permission helpers ────────────────────────────────────────────────────────

export function getNotifPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestNotifPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ── Core push helper ──────────────────────────────────────────────────────────

async function push(title: string, body: string, url = '/dashboard') {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/logo.jpeg',
    badge: '/favicon.ico',
    data: { url },
    tag: `${title}:${url}`,
  };

  try {
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    new Notification(title, options);
  }
}

// ── Stock alerts ──────────────────────────────────────────────────────────────
// Fires at most once per hour per clinic to avoid alert spam.

const STOCK_LS_KEY = 'vetsys-stock-notif-ts';
const STOCK_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export async function checkStockNotifications(clinicId: string): Promise<void> {
  if (!clinicId) return;

  const lastTs = Number(localStorage.getItem(STOCK_LS_KEY) ?? 0);
  if (Date.now() - lastTs < STOCK_THROTTLE_MS) return;
  localStorage.setItem(STOCK_LS_KEY, String(Date.now()));

  const low = await db.products
    .where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt && p.active && p.currentStock <= p.minimumStock)
    .toArray();

  if (low.length === 0) return;

  const empty = low.filter((p) => p.currentStock === 0);
  const names  = (empty.length > 0 ? empty : low).slice(0, 3).map((p) => p.name);
  const extra  = (empty.length > 0 ? empty : low).length - 3;
  const list   = names.join(', ') + (extra > 0 ? ` y ${extra} más` : '');

  if (empty.length > 0) {
    await push(
      `🚨 ${empty.length} producto${empty.length > 1 ? 's' : ''} sin stock`,
      list,
      '/inventory'
    );
  } else {
    await push(
      `⚠️ ${low.length} producto${low.length > 1 ? 's' : ''} con stock bajo`,
      list,
      '/inventory'
    );
  }
}

// ── Appointment reminders ─────────────────────────────────────────────────────
// Schedules browser notifications X minutes before each of today's appointments.
// Returns a cleanup function to cancel pending timers.

interface ApptSlim {
  id: string;
  date: string;
  startTime: string;
  patientName?: string;
}

export function scheduleAppointmentReminders(
  appointments: ApptSlim[],
  minutesBefore = 15
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const appt of appointments) {
    if (appt.date !== todayStr) continue;

    const [h, m] = appt.startTime.split(':').map(Number);
    const apptMs = new Date().setHours(h, m, 0, 0);
    const delay  = apptMs - minutesBefore * 60_000 - Date.now();
    if (delay < 0) continue; // already passed

    const t = setTimeout(async () => {
      await push(
        `📅 Cita en ${minutesBefore} minutos`,
        `${appt.patientName ?? 'Paciente'} — ${appt.startTime}`,
        '/schedule'
      );
    }, delay);

    timers.push(t);
  }

  return () => timers.forEach(clearTimeout);
}

// ── Combined setup hook ───────────────────────────────────────────────────────
// Call once in AppLayout after the session is ready.

export function useSystemNotifications(
  clinicId: string | undefined,
  appointments: ApptSlim[]
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!clinicId) return;
    if (getNotifPermission() !== 'granted') return;
    checkStockNotifications(clinicId);
  }, [clinicId]);

  useEffect(() => {
    cleanupRef.current?.();
    if (getNotifPermission() !== 'granted' || appointments.length === 0) return;
    cleanupRef.current = scheduleAppointmentReminders(appointments, 15);
    return () => cleanupRef.current?.();
  }, [appointments]);
}
