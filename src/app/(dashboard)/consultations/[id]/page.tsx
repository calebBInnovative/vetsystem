import { ConsultationDetailView } from './ConsultationDetailView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ConsultationDetailView params={params} />;
}
