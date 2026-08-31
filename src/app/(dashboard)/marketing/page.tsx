'use client';

import { useState, useMemo } from 'react';
import {
  MessageSquare, Users, ChevronDown, Check, Search,
  Phone, RefreshCcw, Tag, Package, Stethoscope, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMarketingContacts,
  useMarketingDataSources,
  composeMessage,
  buildWhatsAppUrl,
  generateMessageFromSource,
} from '@/hooks/useMarketing';
import {
  MESSAGE_TEMPLATES,
  CONTACT_FILTERS,
  TEMPLATE_NEEDS_SOURCE,
  type ContactFilter,
  type MarketingContact,
  type MarketingDataSource,
} from '@/types/marketing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PromotionLocal } from '@/types/promotion';
import type { ProductLocal } from '@/types/inventory';
import type { ServiceLocal } from '@/types/service';
import { SERVICE_CATEGORIES } from '@/types/service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);

// ── Variable chip ─────────────────────────────────────────────────────────────

const VARS = [
  { label: '{{dueño}}' },
  { label: '{{mascota}}' },
  { label: '{{clinica}}' },
];

function VarChip({ label, onInsert }: { label: string; onInsert: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(label)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-mono hover:bg-primary/10 transition-colors"
    >
      {label}
    </button>
  );
}

// ── Data source picker ────────────────────────────────────────────────────────

function SourcePicker({
  sourceType,
  promotions,
  products,
  services,
  selected,
  onSelect,
}: {
  sourceType: 'promotion' | 'product' | 'service';
  promotions: PromotionLocal[];
  products:   ProductLocal[];
  services:   ServiceLocal[];
  selected:   MarketingDataSource | null;
  onSelect:   (src: MarketingDataSource) => void;
}) {
  const items =
    sourceType === 'promotion' ? promotions :
    sourceType === 'product'   ? products   :
    services.filter((s) => s.category === 'vaccination' || sourceType === 'service');

  const icon =
    sourceType === 'promotion' ? <Tag size={14} /> :
    sourceType === 'product'   ? <Package size={14} /> :
    <Stethoscope size={14} />;

  const placeholder =
    sourceType === 'promotion' ? 'Seleccionar promoción...' :
    sourceType === 'product'   ? 'Seleccionar producto...' :
    'Seleccionar servicio...';

  const selectedLabel =
    selected?.type === 'promotion' ? selected.data.name :
    selected?.type === 'product'   ? selected.data.name :
    selected?.type === 'service'   ? selected.data.name :
    null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {sourceType === 'promotion' ? 'Promoción a enviar' :
         sourceType === 'product'   ? 'Producto a promover' :
         'Servicio a promover'}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full justify-between gap-2 h-9',
              !selectedLabel && 'text-muted-foreground',
            )}
          >
            <span className="flex items-center gap-1.5">
              {icon}
              {selectedLabel ?? placeholder}
            </span>
            <ChevronRight size={13} className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72 max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No hay {sourceType === 'promotion' ? 'promociones activas' :
                      sourceType === 'product'   ? 'productos con precio' :
                      'servicios activos'}
            </div>
          ) : (
            items.map((item) => {
              const isPromo   = sourceType === 'promotion';
              const isProduct = sourceType === 'product';
              const name      = item.name;
              const sub       = isPromo   ? `${fmt((item as PromotionLocal).total)} · ${(item as PromotionLocal).items.length} item(s)` :
                                isProduct ? (item as ProductLocal).salePrice ? fmt((item as ProductLocal).salePrice!) : 'Sin precio' :
                                fmt((item as ServiceLocal).price);
              const active =
                (selected?.type === 'promotion' && selected.data.id === item.id) ||
                (selected?.type === 'product'   && selected.data.id === item.id) ||
                (selected?.type === 'service'   && selected.data.id === item.id);

              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => {
                    if (isPromo)   onSelect({ type: 'promotion', data: item as PromotionLocal });
                    else if (isProduct) onSelect({ type: 'product', data: item as ProductLocal });
                    else           onSelect({ type: 'service',   data: item as ServiceLocal });
                  }}
                  className={cn('gap-2 cursor-pointer flex-col items-start', active && 'bg-accent')}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-sm">{name}</span>
                    {active && <Check size={13} />}
                  </div>
                  <span className="text-xs text-muted-foreground">{sub}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  message,
  clinicName,
  sent,
  onMarkSent,
}: {
  contact:    MarketingContact;
  message:    string;
  clinicName: string;
  sent:       boolean;
  onMarkSent: () => void;
}) {
  const composed = composeMessage(message, contact, clinicName);
  const url      = buildWhatsAppUrl(contact.phone, composed);

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors',
      sent ? 'bg-green-50/50 dark:bg-green-950/20' : 'hover:bg-muted/30',
    )}>
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
        {contact.ownerName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{contact.ownerName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {contact.species} {contact.petNames}
        </p>
      </div>
      <p className="text-xs text-muted-foreground hidden sm:block shrink-0 font-mono">{contact.phone}</p>
      <div className="flex items-center gap-2 shrink-0">
        {sent && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check size={13} /> Enviado
          </span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onMarkSent}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            sent
              ? 'bg-muted text-muted-foreground hover:bg-green-100 hover:text-green-700'
              : 'bg-[#25D366] text-white hover:bg-[#1ebe5d]',
          )}
        >
          <MessageSquare size={13} />
          {sent ? 'Reenviar' : 'Enviar'}
        </a>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const { session }   = useAuth();
  const clinicName    = session?.clinicName ?? 'Pet\'s House';

  const [filter,      setFilter]      = useState<ContactFilter>('all');
  const [templateId,  setTemplateId]  = useState('promo');
  const [message,     setMessage]     = useState(MESSAGE_TEMPLATES[0].body);
  const [dataSource,  setDataSource]  = useState<MarketingDataSource | null>(null);
  const [search,      setSearch]      = useState('');
  const [sentIds,     setSentIds]     = useState<Set<string>>(new Set());

  const { contacts, loading }                        = useMarketingContacts(filter);
  const { promotions, products, services, loading: srcLoading } = useMarketingDataSources();

  const activeTemplate = MESSAGE_TEMPLATES.find((t) => t.id === templateId)!;
  const filterInfo     = CONTACT_FILTERS[filter];
  const sourceType     = TEMPLATE_NEEDS_SOURCE[templateId] ?? null;

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.ownerName.toLowerCase().includes(q) ||
        c.petNames.toLowerCase().includes(q)  ||
        c.phone.includes(q),
    );
  }, [contacts, search]);

  function selectTemplate(id: string) {
    const t = MESSAGE_TEMPLATES.find((t) => t.id === id)!;
    setTemplateId(id);
    setDataSource(null);
    setMessage(t.body);
  }

  function handleSourceSelect(src: MarketingDataSource) {
    setDataSource(src);
    const generated = generateMessageFromSource(src, clinicName);
    setMessage(generated);
  }

  function insertVar(v: string) {
    setMessage((prev) => prev + v);
  }

  function markSent(ownerId: string) {
    setSentIds((prev) => new Set(prev).add(ownerId));
  }

  const previewContact: MarketingContact = contacts[0] ?? {
    ownerId:  '',
    ownerName: 'María López',
    phone:    '50588880000',
    petNames: 'Luna',
    species:  '🐕',
  };
  const preview = composeMessage(message, previewContact, clinicName);

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Envía mensajes personalizados a tus clientes
          </p>
        </div>
        {sentIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-600 font-medium">{sentIds.size} enviados</span>
            <Button variant="ghost" size="sm" onClick={() => setSentIds(new Set())} className="gap-1.5 text-xs">
              <RefreshCcw size={13} /> Reiniciar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* LEFT: composer */}
        <div className="lg:col-span-2 space-y-4">

          {/* Template selector */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold">Tipo de mensaje</p>
            <div className="grid grid-cols-1 gap-2">
              {MESSAGE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm text-left transition-colors',
                    templateId === t.id
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="text-base">{t.emoji}</span>
                  {t.label}
                  {templateId === t.id && <Check size={14} className="ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Data source picker (only for promo / product / vaccine) */}
          {sourceType && !srcLoading && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <SourcePicker
                sourceType={sourceType}
                promotions={promotions}
                products={products}
                services={services}
                selected={dataSource}
                onSelect={handleSourceSelect}
              />
              {!dataSource && (
                <p className="text-xs text-muted-foreground mt-2">
                  Selecciona uno para que el mensaje se complete automáticamente con sus detalles.
                </p>
              )}
            </div>
          )}

          {/* Message composer */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold">Mensaje</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              placeholder="Escribe tu mensaje..."
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Insertar variable:</p>
              <div className="flex flex-wrap gap-1.5">
                {VARS.map((v) => (
                  <VarChip key={v.label} label={v.label} onInsert={insertVar} />
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">Vista previa</p>
            <div className="bg-[#dcf8c6] dark:bg-[#1a3a2a] rounded-xl rounded-tl-none px-3 py-2.5 text-sm whitespace-pre-wrap text-[#111] dark:text-[#e2ffe2] font-sans max-h-52 overflow-y-auto">
              {preview}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Con datos de: {previewContact.ownerName} · {previewContact.petNames}
            </p>
          </div>
        </div>

        {/* RIGHT: contact list */}
        <div className="lg:col-span-3 space-y-3">

          {/* Filters + search */}
          <div className="flex gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9">
                  <span>{filterInfo.emoji}</span>
                  {filterInfo.label}
                  <ChevronDown size={13} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {(Object.entries(CONTACT_FILTERS) as [ContactFilter, typeof CONTACT_FILTERS[ContactFilter]][]).map(([key, info]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn('gap-2 cursor-pointer', filter === key && 'bg-accent')}
                  >
                    <span>{info.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{info.label}</p>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                    {filter === key && <Check size={13} />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente o mascota..."
                className="w-full pl-8 pr-3 h-9 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Users size={14} />
            {loading
              ? 'Cargando...'
              : <>{visible.length} contacto{visible.length !== 1 ? 's' : ''} · <span className="text-foreground font-medium">{sentIds.size} enviados</span></>
            }
          </div>

          {/* Contact list */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Phone size={32} className="opacity-20" />
                <p className="text-sm">No hay contactos con este filtro</p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                {visible.map((c) => (
                  <ContactRow
                    key={c.ownerId}
                    contact={c}
                    message={message}
                    clinicName={clinicName}
                    sent={sentIds.has(c.ownerId)}
                    onMarkSent={() => markSent(c.ownerId)}
                  />
                ))}
              </div>
            )}
          </div>

          {visible.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Cada botón abre WhatsApp con el mensaje listo — solo toca Enviar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
