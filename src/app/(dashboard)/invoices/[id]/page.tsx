import { InvoiceDetailView } from './InvoiceDetailView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <InvoiceDetailView params={params} />;
}
