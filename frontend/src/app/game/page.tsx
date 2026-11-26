import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { GameScreen } from '@/screens/Events';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <GameScreen />
    </Suspense>
  );
}
