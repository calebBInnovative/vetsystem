'use client';

import { useState } from 'react';
import { FileDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { exportToExcel, exportToPdf, type ExportColumn } from '@/lib/export';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface ExportMenuProps {
  label: string;
  filename: string;
  getData: () => Promise<{ rows: Record<string, unknown>[]; columns: ExportColumn[] }>;
  clinicName?: string;
}

export function ExportMenu({ label, filename, getData, clinicName }: ExportMenuProps) {
  const [loading, setLoading] = useState(false);

  const run = async (format: 'excel' | 'pdf') => {
    setLoading(true);
    try {
      const { rows, columns } = await getData();
      if (rows.length === 0) {
        toast.info('No hay datos para exportar.');
        return;
      }
      if (format === 'excel') {
        exportToExcel(rows, columns, filename, label);
        toast.success(`${label} exportado a Excel (${rows.length} registros)`);
      } else {
        exportToPdf(rows, columns, filename, label, clinicName);
        toast.success(`${label} exportado a PDF (${rows.length} registros)`);
      }
    } catch (err) {
      console.error('[export] error:', err);
      toast.error('Error al exportar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading} className="gap-1.5">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FileDown className="h-4 w-4" />
          }
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => run('excel')} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('pdf')} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4 text-red-500" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
