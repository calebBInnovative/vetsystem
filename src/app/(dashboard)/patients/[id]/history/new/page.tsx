import { NewConsultationView } from './NewConsultationView';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <NewConsultationView />;
}
