import { InvoiceDetailView } from './InvoiceDetailView';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <InvoiceDetailView />;
}
