'use client';

import { useState, useMemo } from 'react';
import { MessageSquare, Send, Users, ChevronDown, Check, Search, Phone, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMarketingContacts, composeMessage, buildWhatsAppUrl } from '@/hooks/useMarketing';
import {
  MESSAGE_TEMPLATES,
  CONTACT_FILTERS,
  type ContactFilter,
  type MarketingContact,
} from '@/types/marketing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Variables chip bar ────────────────────────────────────────────────────────

const VARS = [
  { label: '{{dueño}}',   desc: 'Nombre del dueño' },
  { label: '{{mascota}}', desc: 'Nombre de la mascota' },
  { label: '{{clinica}}', desc: 'Nombre de la clínica' },
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

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  message,
  sent,
  onMarkSent,
}: {
  contact: MarketingContact;
  message: string;
  sent: boolean;
  onMarkSent: () => void;
}) {
  const composed = composeMessage(message, contact, 'Pet\'s House');
  const url      = buildWhatsAppUrl(contact.phone, composed);

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors',
      sent ? 'bg-green-50/50 dark:bg-green-950/20' : 'hover:bg-muted/30',
    )}>
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
        {contact.ownerName.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{contact.ownerName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {contact.species} {contact.petNames}
        </p>
      </div>

      {/* Phone */}
      <p className="text-xs text-muted-foreground hidden sm:block shrink-0 font-mono">{contact.phone}</p>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {sent ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check size={13} /> Enviado
          </span>
        ) : null}
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
  const { session } = useAuth();
  const clinicName  = session?.clinicName ?? 'Pet\'s House';

  const [filter,       setFilter]       = useState<ContactFilter>('all');
  const [templateId,   setTemplateId]   = useState('promo');
  const [message,      setMessage]      = useState(MESSAGE_TEMPLATES[0].body);
  const [search,       setSearch]       = useState('');
  const [sentIds,      setSentIds]      = useState<Set<string>>(new Set());

  const { contacts, loading } = useMarketingContacts(filter);

  const activeTemplate = MESSAGE_TEMPLATES.find((t) => t.id === templateId)!;
  const filterInfo     = CONTACT_FILTERS[filter];

  // Filter by search
  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.ownerName.toLowerCase().includes(q) ||
        c.petNames.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [contacts, search]);

  const sentCount = sentIds.size;

  function selectTemplate(id: string) {
    const t = MESSAGE_TEMPLATES.find((t) => t.id === id)!;
    setTemplateId(id);
    setMessage(t.body);
  }

  function insertVar(v: string) {
    setMessage((prev) => prev + v);
  }

  function markSent(ownerId: string) {
    setSentIds((prev) => new Set(prev).add(ownerId));
  }

  function resetSent() {
    setSentIds(new Set());
  }

  // Preview with first contact
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
        {sentCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-600 font-medium">{sentCount} enviados</span>
            <Button variant="ghost" size="sm" onClick={resetSent} className="gap-1.5 text-xs">
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
            <p className="text-sm font-semibold">Plantilla</p>
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

          {/* Message composer */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold">Mensaje</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
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

          {/* Filters + search bar */}
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
              : <>{visible.length} contacto{visible.length !== 1 ? 's' : ''} · <span className="text-foreground font-medium">{sentCount} enviados</span></>
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
