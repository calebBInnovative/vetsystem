import { HistoryView } from './HistoryView';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <HistoryView />;
}
