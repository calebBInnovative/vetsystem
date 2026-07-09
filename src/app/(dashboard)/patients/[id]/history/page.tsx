import { HistoryView } from './HistoryView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <HistoryView params={params} />;
}
