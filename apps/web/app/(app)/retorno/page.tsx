import { getFunil } from './actions';
import { FunilView } from './_components/funil-view';
import { requireCapability } from '@/lib/guard';

export const metadata = { title: 'Retorno · DreamClin' };

export default async function RetornoPage() {
  await requireCapability('pacientes');
  const data = await getFunil();
  return <FunilView data={data} />;
}
