import { FichaPaciente } from '@/components/patients/PatientProfile';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function PatientProfilePage() {
  return <FichaPaciente />;
}
