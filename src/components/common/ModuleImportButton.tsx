'use client';

import { useState, useRef } from 'react';
import { Upload, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

interface ImportResult {
  imported: number;
  skipped: number;
}

interface ModuleImportButtonProps {
  /** Human-readable module name shown in the dialog, e.g. "Inventario" */
  moduleName: string;
  /** Function that receives the file and performs the import */
  onImport: (file: File) => Promise<ImportResult>;
}

export function ModuleImportButton({ moduleName, onImport }: ModuleImportButtonProps) {
  const [open,    setOpen]    = useState(false);
  const [file,    setFile]    = useState<File | null>(null);
  const [phase,   setPhase]   = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [result,  setResult]  = useState<ImportResult | null>(null);
  const [errMsg,  setErrMsg]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setFile(null);
    setPhase('idle');
    setResult(null);
    setErrMsg('');
    setOpen(true);
  }

  function handleClose() {
    if (phase === 'importing') return;
    setOpen(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setPhase('idle');
    setErrMsg('');
  }

  async function handleImport() {
    if (!file) return;
    setPhase('importing');
    setErrMsg('');
    try {
      const res = await onImport(file);
      setResult(res);
      setPhase('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Error desconocido al importar.');
      setPhase('error');
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen} className="gap-1.5">
        <Upload size={14} /> Importar
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar {moduleName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Warning */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/8 px-4 py-3">
              <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                <p className="font-medium">Esta acción reemplazará todos los datos de {moduleName}</p>
                <p className="text-xs opacity-80">
                  Los registros actuales serán eliminados y reemplazados por los del archivo.
                  Solo afecta a este módulo — el resto de la clínica no cambia.
                </p>
              </div>
            </div>

            {phase === 'done' && result ? (
              <div className="flex items-center gap-3 rounded-xl border border-green-400/30 bg-green-500/8 px-4 py-3">
                <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  {result.imported} registros importados correctamente
                  {result.skipped > 0 ? `, ${result.skipped} omitidos por datos inválidos` : ''}.
                </p>
              </div>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 px-6 py-8 cursor-pointer transition-colors select-none"
                >
                  <Upload size={24} className="text-muted-foreground" />
                  {file ? (
                    <>
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Seleccionar archivo</p>
                      <p className="text-xs text-muted-foreground">Excel (.xlsx) o CSV</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.csv,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {phase === 'error' && errMsg && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle size={14} className="shrink-0" />
                    {errMsg}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={phase === 'importing'}
            >
              {phase === 'done' ? 'Cerrar' : 'Cancelar'}
            </Button>
            {phase !== 'done' && (
              <Button
                onClick={handleImport}
                disabled={!file || phase === 'importing'}
                className="gap-2"
              >
                {phase === 'importing' && <span className="inline-block animate-spin">↻</span>}
                {phase === 'importing' ? 'Importando…' : 'Importar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
