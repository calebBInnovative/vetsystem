'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductoForm } from '@/components/inventario/ProductoForm';
import { crearProducto } from '@/hooks/useInventario';
import { type ProductoFormData } from '@/lib/validations/inventario.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function NuevoProductoPage() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (datos: ProductoFormData) => {
    setCargando(true);
    try {
      const id = await crearProducto(datos);
      toast.success('Producto registrado', {
        description: `${datos.nombre} fue agregado al inventario.`,
      });
      router.push(`/inventario/${id}`);
    } catch {
      toast.error('Error al guardar', {
        description: 'No se pudo registrar el producto. Intenta de nuevo.',
      });
      setCargando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventario">
          <Button variant="ghost" size="icon">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nuevo Producto</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agrega un medicamento, vacuna u otro producto
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <ProductoForm onSubmit={handleSubmit} cargando={cargando} />
      </div>
    </div>
  );
}
