import { ConsultationDetailView } from './ConsultationDetailView';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <ConsultationDetailView />;
}
