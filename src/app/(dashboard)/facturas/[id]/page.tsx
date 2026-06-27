import { FacturaDetalleView } from './FacturaDetalleView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <FacturaDetalleView params={params} />;
}
