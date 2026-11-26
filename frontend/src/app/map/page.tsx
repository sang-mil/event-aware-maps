import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { MapScreen } from '@/screens/Route';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <MapScreen />
    </Suspense>
  );
}
