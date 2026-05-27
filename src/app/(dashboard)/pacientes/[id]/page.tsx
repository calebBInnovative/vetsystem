import { FichaPaciente } from '@/components/pacientes/FichaPaciente';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FichaPacientePage({ params }: Props) {
  const { id } = await params;
  return <FichaPaciente pacienteId={id} />;
}
