import { HistorialView } from './HistorialView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <HistorialView params={params} />;
}
