import { ConsultaDetalleView } from './ConsultaDetalleView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ConsultaDetalleView params={params} />;
}
