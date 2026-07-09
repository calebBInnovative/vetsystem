import { FichaPaciente } from '@/components/patients/PatientProfile';

export function generateStaticParams() {
  return [{ id: "_" }];
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientProfilePage({ params }: Props) {
  const { id } = await params;
  return <FichaPaciente pacienteId={id} />;
}
