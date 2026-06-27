import { ProductoDetalleView } from './ProductoDetalleView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProductoDetalleView params={params} />;
}
