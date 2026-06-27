import { FichaPaciente } from '@/components/pacientes/FichaPaciente';

export function generateStaticParams() {
  return [{ id: "_" }];
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FichaPacientePage({ params }: Props) {
  const { id } = await params;
  return <FichaPaciente pacienteId={id} />;
}
