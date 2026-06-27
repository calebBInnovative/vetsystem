'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sembrarDatos, limpiarDatos } from '@/lib/dev/seed';
import { syncService, type SyncAllProgress } from '@/lib/sync/sync.service';
import {
  crearUsuario, actualizarUsuario, eliminarUsuario, enviarResetPassword,
  configurarLicencia, actualizarPerfilClinica, listarUsuarios,
  type NuevoUsuario, type UsuarioFirestore,
} from '@/lib/auth/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, Sprout, Trash2, CheckCircle2, AlertCircle,
  CloudUpload, RefreshCw, Database, Wifi, WifiOff, AlertTriangle,
  UserPlus, Users, KeyRound, ShieldAlert, Pencil, KeySquare, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuloApp, PermisosModulos, RolUsuario } from '@/types/licencia';

// ─── Module permission config ─────────────────────────────────────────────────

const MODULOS: { key: ModuloApp; label: string }[] = [
  { key: 'pacientes',  label: 'Pacientes'  },
  { key: 'agenda',     label: 'Agenda'     },
  { key: 'consultas',  label: 'Consultas'  },
  { key: 'ventas',     label: 'Ventas'     },
  { key: 'inventario', label: 'Inventario' },
  { key: 'finanzas',   label: 'Finanzas'   },
  { key: 'facturas',   label: 'Facturas'   },
  { key: 'servicios',  label: 'Servicios'  },
];

const PERMISOS_DEFAULT: PermisosModulos = {
  pacientes: true, agenda: true, consultas: true, ventas: true,
  inventario: false, finanzas: false, facturas: false, servicios: false,
};

function permisosParaRol(role: RolUsuario, current: PermisosModulos | null): PermisosModulos | null {
  if (role === 'admin') return null;
  return current ?? { ...PERMISOS_DEFAULT };
}

type Accion = 'idle' | 'cargando' | 'ok' | 'error';

interface QueueEstado {
  pendientes: number;
  conError:   number;
}

const ENV         = process.env.NODE_ENV;
const PROYECTO_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '—';
const ES_PROD     = PROYECTO_ID && !PROYECTO_ID.startsWith('REEMPLAZAR');

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { session, cargando } = useAuth();
  const router = useRouter();
  const esMaster = session?.role === 'master';
  const esAdmin  = session?.role === 'admin' || esMaster;

  const [tab, setTab] = useState<'clinica' | 'usuarios' | 'plan' | 'datos' | 'firebase' | 'estado'>('clinica');

  useEffect(() => {
    if (!cargando && !esAdmin) router.replace('/dashboard');
  }, [cargando, esAdmin, router]);

  if (cargando) return null;
  if (!esAdmin) return null;

  type TabKey = 'clinica' | 'usuarios' | 'plan' | 'datos' | 'firebase' | 'estado';
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'clinica',   label: 'Clínica'        },
    { key: 'usuarios',  label: 'Usuarios'       },
    { key: 'plan',      label: 'Plan'           },
    ...(esMaster ? [
      { key: 'datos'    as TabKey, label: 'Datos locales' },
      { key: 'firebase' as TabKey, label: 'Firebase sync' },
      { key: 'estado'   as TabKey, label: 'Estado DB'     },
    ] : []),
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {esMaster ? 'Panel master' : 'Administración'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {esMaster
              ? 'Gestión completa: usuarios, plan, datos, sync y estado de la DB'
              : 'Gestiona tu equipo y la suscripción de tu clínica'}
          </p>
        </div>
        {esMaster && <EnvBadge />}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'clinica'  && <TabClinica />}
      {tab === 'usuarios' && <TabUsuarios esMaster={esMaster} />}
      {tab === 'plan'     && <TabPlan esMaster={esMaster} />}
      {esMaster && tab === 'datos'    && <TabDatos />}
      {esMaster && tab === 'firebase' && <TabFirebase />}
      {esMaster && tab === 'estado'   && <TabEstado />}
    </div>
  );
}

// ─── Badge de entorno ─────────────────────────────────────────────────────────

function EnvBadge() {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={cn(
        'text-xs font-mono px-2.5 py-1 rounded-full font-semibold',
        ENV === 'development'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
      )}>
        {ENV === 'development' ? '⚙ DEV' : '🚀 PROD'}
      </span>
      <span className="text-[10px] text-muted-foreground font-mono">{PROYECTO_ID}</span>
    </div>
  );
}

// ─── Permissions editor ───────────────────────────────────────────────────────

function PermisosEditor({
  permisos, onChange,
}: {
  permisos: PermisosModulos;
  onChange: (p: PermisosModulos) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Acceso a módulos</p>
      <div className="grid grid-cols-2 gap-1.5">
        {MODULOS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer select-none rounded-lg px-2.5 py-1.5 hover:bg-muted/60 transition-colors">
            <input
              type="checkbox"
              checked={permisos[key] ?? false}
              onChange={(e) => onChange({ ...permisos, [key]: e.target.checked })}
              className="accent-primary h-3.5 w-3.5"
            />
            <span className="text-xs">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Usuarios ────────────────────────────────────────────────────────────

const ROLES_STAFF: { value: RolUsuario; label: string }[] = [
  { value: 'admin',       label: 'Admin'       },
  { value: 'veterinario', label: 'Veterinario' },
  { value: 'recepcion',   label: 'Recepción'   },
];

function TabUsuarios({ esMaster }: { esMaster: boolean }) {
  const { session } = useAuth();
  const clinicId = session?.clinicId ?? process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';

  const [usuarios,  setUsuarios]  = useState<UsuarioFirestore[]>([]);
  const [cargandoU, setCargandoU] = useState(true);

  // ── Create form state ──────────────────────────────────────────────────────
  const [form, setForm] = useState<NuevoUsuario>({
    email: '', password: '', name: '', role: 'veterinario',
    clinicId, permisos: { ...PERMISOS_DEFAULT },
  });
  const [accionCrear, setAccionCrear] = useState<Accion>('idle');
  const [mensajeCrear, setMensajeCrear] = useState('');

  // ── Edit modal ─────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<UsuarioFirestore | null>(null);
  const [editForm,   setEditForm]   = useState<{ name: string; role: RolUsuario; permisos: PermisosModulos | null }>({
    name: '', role: 'veterinario', permisos: { ...PERMISOS_DEFAULT },
  });
  const [accionEdit, setAccionEdit] = useState<Accion>('idle');

  // ── Reset password modal ───────────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<UsuarioFirestore | null>(null);
  const [accionReset, setAccionReset] = useState<Accion>('idle');

  // ── Delete modal ───────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<UsuarioFirestore | null>(null);
  const [accionDelete, setAccionDelete] = useState<Accion>('idle');


  const cargarUsuarios = useCallback(async () => {
    setCargandoU(true);
    try { setUsuarios(await listarUsuarios(clinicId)); }
    catch { /* sin conexión */ }
    finally { setCargandoU(false); }
  }, [clinicId]);

  useEffect(() => { cargarUsuarios(); }, [cargarUsuarios]);

  // ── Create ─────────────────────────────────────────────────────────────────
  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setAccionCrear('cargando'); setMensajeCrear('');
    try {
      await crearUsuario({ ...form, clinicId });
      setMensajeCrear(`Usuario ${form.email} creado.`);
      setAccionCrear('ok');
      setForm({ email: '', password: '', name: '', role: 'veterinario', clinicId, permisos: { ...PERMISOS_DEFAULT } });
      cargarUsuarios();
    } catch (err) {
      setMensajeCrear((err as Error).message);
      setAccionCrear('error');
    }
  }

  function abrirEdit(u: UsuarioFirestore) {
    setEditTarget(u);
    setEditForm({
      name:    u.name,
      role:    u.role,
      permisos: u.role === 'admin' ? null : (u.permisos ?? { ...PERMISOS_DEFAULT }),
    });
    setAccionEdit('idle');
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  async function handleGuardarEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setAccionEdit('cargando');
    try {
      await actualizarUsuario(editTarget.uid, editForm);
      setAccionEdit('ok');
      cargarUsuarios();
      setTimeout(() => setEditTarget(null), 800);
    } catch (err) {
      setAccionEdit('error');
      console.error(err);
    }
  }

  // ── Reset password ─────────────────────────────────────────────────────────
  async function handleReset() {
    if (!resetTarget) return;
    setAccionReset('cargando');
    try {
      await enviarResetPassword(resetTarget.email);
      setAccionReset('ok');
      setTimeout(() => setResetTarget(null), 1200);
    } catch (err) {
      setAccionReset('error');
      console.error(err);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setAccionDelete('cargando');
    try {
      await eliminarUsuario(deleteTarget.uid);
      setDeleteTarget(null);
      setAccionDelete('idle');
      cargarUsuarios();
    } catch (err) {
      setAccionDelete('error');
      console.error(err);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── User list ── */}
      <Card titulo="Usuarios registrados" desc={`Clínica: ${clinicId}`}>
        <button
          type="button"
          onClick={cargarUsuarios}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <RefreshCw size={11} /> Recargar
        </button>

        {cargandoU ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </div>
        ) : usuarios.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Users size={24} className="mx-auto mb-2 opacity-40" />
            Sin usuarios en Firestore.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {usuarios.map((u) => (
              <div key={u.uid} className="flex items-center gap-3 py-2.5">
                <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {u.name?.slice(0, 2).toUpperCase() ?? 'US'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0',
                  u.role === 'master'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {u.role}
                </span>
                {u.role !== 'master' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => abrirEdit(u)}
                      title="Editar"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => { setResetTarget(u); setAccionReset('idle'); }}
                      title="Resetear contraseña"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <KeySquare size={13} />
                    </button>
                    {/* Admins represent the clinic — only staff can be deleted */}
                    {(u.role === 'veterinario' || u.role === 'recepcion') && (
                      <button
                        onClick={() => { setDeleteTarget(u); setAccionDelete('idle'); }}
                        title="Eliminar"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Create user form ── */}
      <Card titulo="Crear usuario del equipo" desc="Se crea en Firebase Auth + Firestore. Requiere internet.">
        <form onSubmit={handleCrear} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nombre completo</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dra. Ana López"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Rol</label>
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value as RolUsuario;
                  setForm({ ...form, role, permisos: permisosParaRol(role, form.permisos) });
                }}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLES_STAFF.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="ana@clinica.com"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium flex items-center gap-1.5">
              <KeyRound size={11} /> Contraseña temporal
            </label>
            <input
              type="text"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="mínimo 6 caracteres"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">El usuario puede cambiarla desde su perfil.</p>
          </div>

          {form.role !== 'admin' && form.permisos && (
            <div className="rounded-xl border border-border p-3">
              <PermisosEditor
                permisos={form.permisos}
                onChange={(p) => setForm({ ...form, permisos: p })}
              />
            </div>
          )}
          {form.role === 'admin' && (
            <p className="text-[11px] text-muted-foreground px-1">
              Los admins tienen acceso completo a todos los módulos.
            </p>
          )}

          <Button type="submit" disabled={accionCrear === 'cargando'} className="w-full gap-2">
            {accionCrear === 'cargando' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Crear usuario
          </Button>
          <ResultadoBox accion={accionCrear} mensaje={mensajeCrear} />
        </form>
      </Card>


      {/* ── Edit modal ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGuardarEdit} className="space-y-4 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nombre completo</label>
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Rol</label>
              <select
                value={editForm.role}
                onChange={(e) => {
                  const role = e.target.value as RolUsuario;
                  setEditForm({ ...editForm, role, permisos: permisosParaRol(role, editForm.permisos) });
                }}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLES_STAFF.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {editForm.role !== 'admin' && editForm.permisos ? (
              <div className="rounded-xl border border-border p-3">
                <PermisosEditor
                  permisos={editForm.permisos}
                  onChange={(p) => setEditForm({ ...editForm, permisos: p })}
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground px-1">
                Los admins tienen acceso completo a todos los módulos.
              </p>
            )}

            {accionEdit === 'error' && (
              <p className="text-xs text-destructive">Error al guardar. Intenta de nuevo.</p>
            )}
            {accionEdit === 'ok' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} /> Guardado.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={accionEdit === 'cargando'}>
                {accionEdit === 'cargando' && <Loader2 size={13} className="animate-spin mr-1.5" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reset password modal ── */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Se enviará un email de recuperación a{' '}
              <span className="font-medium text-foreground">{resetTarget?.email}</span>.
              El usuario podrá crear una nueva contraseña desde el enlace.
            </p>
            {accionReset === 'ok' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} /> Email enviado correctamente.
              </p>
            )}
            {accionReset === 'error' && (
              <p className="text-xs text-destructive">Error al enviar el email. ¿Tienes conexión?</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancelar</Button>
            <Button
              onClick={handleReset}
              disabled={accionReset === 'cargando' || accionReset === 'ok'}
              className="gap-2"
            >
              {accionReset === 'cargando'
                ? <Loader2 size={13} className="animate-spin" />
                : <KeySquare size={13} />}
              Enviar email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation modal ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <p className="text-sm text-muted-foreground">
              ¿Eliminar a{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
              Perderá acceso al sistema de inmediato. Esta acción no se puede deshacer.
            </p>
            {accionDelete === 'error' && (
              <p className="text-xs text-destructive">Error al eliminar. Intenta de nuevo.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={accionDelete === 'cargando'}
              className="gap-2"
            >
              {accionDelete === 'cargando'
                ? <Loader2 size={13} className="animate-spin" />
                : <Trash2 size={13} />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Tab: Clínica (admin + master) ───────────────────────────────────────────

// ── Validación teléfono nicaragüense ──────────────────────────────────────────
function validarTel(tel: string): boolean {
  const d = tel.replace(/[\s\-\+]/g, '');
  if (d.startsWith('505')) return /^505\d{8}$/.test(d);
  return /^\d{8}$/.test(d);
}
function formatearTel(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;
}

function TabClinica() {
  const { session, refreshFromDexie } = useAuth();
  const clinicId = session?.clinicId ?? process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';

  const [nombre,   setNombre]   = useState(session?.clinicName ?? '');
  const [telefono, setTelefono] = useState(session?.clinicTel  ?? '');
  const [telError, setTelError] = useState('');
  const [accion,   setAccion]   = useState<Accion>('idle');

  function handleTelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setTelefono(raw.startsWith('+') ? raw : formatearTel(raw));
    setTelError('');
    setAccion('idle');
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (telefono.trim() && !validarTel(telefono)) {
      setTelError('Número inválido. Usa formato 8163-0097 o +50581630097.');
      return;
    }
    setAccion('cargando');
    try {
      await actualizarPerfilClinica(clinicId, {
        nombre:   nombre.trim(),
        telefono: telefono.trim() || undefined,
      });
      await refreshFromDexie();
      setAccion('ok');
    } catch { setAccion('error'); }
  }

  return (
    <div className="space-y-5">
      <Card titulo="Perfil de la clínica" desc="Nombre e información de contacto que aparece en los recibos.">
        <form onSubmit={handleGuardar} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Nombre de la clínica</label>
            <input
              required
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setAccion('idle'); }}
              placeholder="Pet's House"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Teléfono de contacto</label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={handleTelChange}
                onBlur={() => {
                  if (telefono && !validarTel(telefono)) setTelError('Número inválido.');
                }}
                placeholder="8163-0097"
                className={cn(
                  'w-full rounded-xl border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2',
                  telError
                    ? 'border-destructive focus:ring-destructive/40'
                    : 'border-input focus:ring-ring',
                )}
              />
            </div>
            {telError
              ? <p className="text-xs text-destructive">{telError}</p>
              : <p className="text-xs text-muted-foreground">Formato: 8163-0097 · Se muestra en los recibos de impresión.</p>
            }
          </div>
          <Button type="submit" variant="outline" disabled={accion === 'cargando'} className="gap-2">
            {accion === 'cargando' && <Loader2 size={13} className="animate-spin" />}
            Guardar cambios
          </Button>
          {accion === 'ok' && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Guardado correctamente.
            </p>
          )}
          {accion === 'error' && (
            <p className="text-xs text-destructive">Error al guardar. ¿Tienes conexión?</p>
          )}
        </form>
      </Card>
    </div>
  );
}

// ─── Tab: Plan (admin + master) ──────────────────────────────────────────────

function TabPlan({ esMaster }: { esMaster: boolean }) {
  const { session } = useAuth();
  const clinicId = session?.clinicId ?? process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';

  const activa = session?.subscription === true;

  // State for master's full editor
  const [lic, setLic] = useState({
    clinicName:     session?.clinicName     ?? '',
    plan:           session?.plan           ?? 'Pro',
    expirationDate: session?.expirationDate ?? '',
    subscription:   session?.subscription  ?? true,
  });
  const [accionLic, setAccionLic] = useState<Accion>('idle');

  // Pause / resume for admins
  const [accionPausa, setAccionPausa] = useState<Accion>('idle');
  const [confirmPause, setConfirmPause] = useState(false);

  async function handleGuardarLicencia(e: React.FormEvent) {
    e.preventDefault();
    setAccionLic('cargando');
    try {
      await configurarLicencia({ clinicId, ...lic });
      setAccionLic('ok');
    } catch { setAccionLic('error'); }
  }

  async function handlePausa() {
    setAccionPausa('cargando');
    try {
      await configurarLicencia({
        clinicId,
        clinicName:     session?.clinicName     ?? '',
        plan:           session?.plan           ?? 'Pro',
        expirationDate: session?.expirationDate ?? '',
        subscription:   activa ? false : true,
      });
      setAccionPausa('ok');
      setConfirmPause(false);
    } catch { setAccionPausa('error'); }
  }

  return (
    <div className="space-y-5">

      {/* Current plan info */}
      <Card titulo="Tu suscripción actual" desc={`Clínica: ${session?.clinicName ?? clinicId}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Plan</p>
            <p className="text-sm font-semibold">{session?.plan ?? '—'}</p>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Estado</p>
            <span className={cn(
              'inline-flex items-center gap-1.5 text-xs font-semibold',
              activa ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400',
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', activa ? 'bg-green-500' : 'bg-amber-400')} />
              {activa ? 'Activa' : 'Pausada'}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3 col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Vence el</p>
            <p className="text-sm font-semibold">{session?.expirationDate ?? '—'}</p>
          </div>
        </div>
      </Card>

      {/* Pause / resume — admins only */}
      {!esMaster && (
        <Card
          titulo={activa ? 'Pausar suscripción' : 'Reactivar suscripción'}
          desc={activa
            ? 'Al pausar, tú y tu equipo perderán acceso al sistema hasta reactivarla.'
            : 'Reactiva tu suscripción para volver a tener acceso completo.'}
        >
          {!confirmPause ? (
            <Button
              variant={activa ? 'outline' : 'default'}
              className={cn('gap-2', activa && 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30')}
              onClick={() => setConfirmPause(true)}
            >
              {activa ? 'Pausar suscripción' : 'Reactivar suscripción'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Advertencia tipo={activa ? 'riesgo' : 'info'}>
                {activa
                  ? '¿Estás seguro? Tu equipo perderá acceso de inmediato.'
                  : '¿Confirmas que deseas reactivar tu suscripción?'}
              </Advertencia>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirmPause(false)}>
                  Cancelar
                </Button>
                <Button
                  variant={activa ? 'destructive' : 'default'}
                  disabled={accionPausa === 'cargando'}
                  onClick={handlePausa}
                >
                  {accionPausa === 'cargando' && <Loader2 size={13} className="animate-spin mr-1.5" />}
                  {activa ? 'Sí, pausar' : 'Sí, reactivar'}
                </Button>
              </div>
              {accionPausa === 'ok' && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Cambio guardado. Recarga para ver el nuevo estado.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Cancel note — admins only */}
      {!esMaster && (
        <Card titulo="Cancelar cuenta" desc="La cancelación elimina permanentemente tu clínica y sus datos.">
          <p className="text-xs text-muted-foreground">
            Para cancelar tu cuenta de VetSystem, contacta al soporte:{' '}
            <a href="mailto:soporte@vetsystem.app" className="underline text-foreground">
              soporte@vetsystem.app
            </a>
          </p>
        </Card>
      )}

      {/* Full license editor — master only */}
      {esMaster && (
        <Card titulo="Editor de licencia" desc="Configura el plan de cualquier clínica. Se replica al reconectar.">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-3">
            <ShieldAlert size={12} /> Solo visible para master
          </div>
          <form onSubmit={handleGuardarLicencia} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Nombre clínica</label>
                <input
                  required
                  value={lic.clinicName}
                  onChange={(e) => setLic({ ...lic, clinicName: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Plan</label>
                <input
                  required
                  value={lic.plan}
                  onChange={(e) => setLic({ ...lic, plan: e.target.value })}
                  placeholder="Pro, Básico…"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Vence el</label>
                <input
                  type="date"
                  required
                  value={lic.expirationDate}
                  onChange={(e) => setLic({ ...lic, expirationDate: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Estado</label>
                <select
                  value={lic.subscription ? 'active' : 'inactive'}
                  onChange={(e) => setLic({ ...lic, subscription: e.target.value === 'active' })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Pausada</option>
                </select>
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={accionLic === 'cargando'} className="w-full gap-2">
              {accionLic === 'cargando' && <Loader2 size={14} className="animate-spin" />}
              Guardar licencia
            </Button>
            {accionLic === 'ok' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} /> Guardado en Firestore.
              </p>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Datos locales (master only) ────────────────────────────────────────

function TabDatos() {
  const [accion,  setAccion]  = useState<Accion>('idle');
  const [mensaje, setMensaje] = useState('');
  const [conteos, setConteos] = useState<Record<string, number> | null>(null);

  async function sembrar() {
    setAccion('cargando'); setConteos(null);
    try {
      const r = await sembrarDatos();
      setMensaje(r.mensaje); setConteos(r.conteos); setAccion('ok');
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  async function limpiar() {
    if (!confirm('¿Limpiar TODOS los datos locales? No se puede deshacer.')) return;
    setAccion('cargando'); setConteos(null);
    try {
      await limpiarDatos();
      setMensaje('Base de datos local limpiada.'); setAccion('ok');
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  return (
    <div className="space-y-4">
      <Advertencia>
        Opera solo sobre <strong>IndexedDB local</strong> (este navegador). No toca Firebase.
      </Advertencia>
      <Card titulo="Datos de prueba" desc="8 dueños · 12 pacientes · consultas · citas · 18 productos · 30 pagos">
        <div className="flex gap-3">
          <Button onClick={sembrar} disabled={accion === 'cargando'} className="gap-2 flex-1">
            {accion === 'cargando' ? <Loader2 size={14} className="animate-spin" /> : <Sprout size={14} />}
            Sembrar datos
          </Button>
          <Button onClick={limpiar} variant="outline" disabled={accion === 'cargando'}
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
            <Trash2 size={14} /> Limpiar todo
          </Button>
        </div>
      </Card>
      <ResultadoBox accion={accion} mensaje={mensaje} conteos={conteos} />
    </div>
  );
}

// ─── Tab: Firebase sync (master only) ────────────────────────────────────────

function TabFirebase() {
  const [online,   setOnline]   = useState(true);
  const [queue,    setQueue]    = useState<QueueEstado | null>(null);
  const [progress, setProgress] = useState<SyncAllProgress[]>([]);
  const [accion,   setAccion]   = useState<Accion>('idle');
  const [mensaje,  setMensaje]  = useState('');

  const cargarQueue = useCallback(async () => {
    const e = await syncService.estadoQueue();
    setQueue(e);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    cargarQueue();
  }, [cargarQueue]);

  async function handleFlush() {
    setAccion('cargando');
    try {
      await syncService.flush();
      await cargarQueue();
      setMensaje('Queue drenada.'); setAccion('ok');
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  async function handleSyncAll() {
    if (!online) return;
    setAccion('cargando'); setProgress([]);
    try {
      const r = await syncService.syncAll((p) =>
        setProgress((prev) => {
          const idx = prev.findIndex((x) => x.coleccion === p.coleccion);
          if (idx >= 0) { const n = [...prev]; n[idx] = p; return n; }
          return [...prev, p];
        }),
      );
      setMensaje(`${r.total} documentos enviados · ${r.errores} errores.`);
      setAccion(r.errores > 0 ? 'error' : 'ok');
      await cargarQueue();
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  return (
    <div className="space-y-4">
      <div className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium',
        online
          ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
      )}>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {online ? 'Online' : 'Sin conexión — sync deshabilitado'}
        <span className="ml-auto font-mono text-xs opacity-60">{PROYECTO_ID}</span>
      </div>

      {queue && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-3xl font-bold">{queue.pendientes}</p>
            <p className="text-xs text-muted-foreground mt-1">Pendientes en queue</p>
          </div>
          <div className={cn('rounded-xl border bg-card p-4 text-center', queue.conError > 0 ? 'border-red-300' : 'border-border')}>
            <p className={cn('text-3xl font-bold', queue.conError > 0 && 'text-destructive')}>{queue.conError}</p>
            <p className="text-xs text-muted-foreground mt-1">Con error (&gt;5 intentos)</p>
          </div>
        </div>
      )}

      <Card titulo="Drenar queue" desc="Envía los ítems pendientes en la cola">
        <Button onClick={handleFlush} variant="outline" disabled={accion === 'cargando' || !online} className="gap-2">
          <RefreshCw size={14} /> Flush ahora
        </Button>
      </Card>

      <Card titulo="Sync completo → Firebase" desc="Lee TODAS las tablas de Dexie y las empuja a Firebase.">
        {!ES_PROD && (
          <Advertencia tipo="riesgo">
            El proyecto Firebase apunta a <strong>PROD</strong>. Asegúrate de querer sobrescribir datos reales.
          </Advertencia>
        )}
        <Button onClick={handleSyncAll} disabled={accion === 'cargando' || !online} className="gap-2 w-full">
          {accion === 'cargando' ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
          Sync todo a Firebase
        </Button>
        {progress.length > 0 && (
          <div className="mt-3 space-y-2">
            {progress.map((p) => (
              <div key={p.coleccion} className="space-y-1">
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-28 font-mono text-muted-foreground truncate">{p.coleccion}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${p.total > 0 ? (p.enviados / p.total) * 100 : 100}%` }} />
                  </div>
                  <span className="text-muted-foreground tabular-nums w-16 text-right">
                    {p.enviados}/{p.total}
                    {p.errores > 0 && <span className="text-destructive ml-1"> ·{p.errores}err</span>}
                  </span>
                </div>
                {p.mensajesError?.map((msg, i) => (
                  <p key={i} className="text-[10px] text-destructive font-mono pl-[7.5rem] leading-tight break-all">↳ {msg}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ResultadoBox accion={accion} mensaje={mensaje} />
    </div>
  );
}

// ─── Tab: Estado DB (master only) ─────────────────────────────────────────────

function TabEstado() {
  const [conteos,  setConteos]  = useState<Record<string, number> | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    syncService.conteoTablas().then((c) => { setConteos(c); setCargando(false); });
  }, []);

  return (
    <div className="space-y-4">
      <Card titulo="Registros en Dexie (IndexedDB local)" desc="Conteo actual por colección">
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Contando…
          </div>
        ) : conteos ? (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(conteos).map(([col, n]) => (
              <div key={col} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Database size={11} /> {col}
                </span>
                <span className="text-xs font-semibold tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function Card({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div>
        <p className="font-medium text-sm">{titulo}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Advertencia({ children, tipo = 'info' }: { children: React.ReactNode; tipo?: 'info' | 'riesgo' }) {
  return (
    <div className={cn(
      'rounded-xl border p-3.5 text-sm flex items-start gap-2',
      tipo === 'info'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
        : 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300',
    )}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function ResultadoBox({
  accion, mensaje, conteos,
}: { accion: Accion; mensaje: string; conteos?: Record<string, number> | null }) {
  if (accion === 'idle') return null;
  if (accion === 'ok') return (
    <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 space-y-3">
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle2 size={16} /> <span className="font-medium text-sm">{mensaje}</span>
      </div>
      {conteos && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(conteos).map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-lg bg-white/60 dark:bg-white/5 px-3 py-2">
              <span className="text-xs text-muted-foreground capitalize">{k}</span>
              <span className="text-xs font-semibold">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  if (accion === 'error') return (
    <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex items-center gap-2 text-red-700 dark:text-red-400">
      <AlertCircle size={16} className="shrink-0" />
      <p className="text-sm">{mensaje}</p>
    </div>
  );
  return null;
}
