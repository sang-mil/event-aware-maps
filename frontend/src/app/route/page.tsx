import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { RouteScreen } from '@/screens/Route';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <RouteScreen />
    </Suspense>
  );
}
