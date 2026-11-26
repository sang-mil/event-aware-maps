import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { EventScreen } from '@/screens/Events';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <EventScreen />
    </Suspense>
  );
}
