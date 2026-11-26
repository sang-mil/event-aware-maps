import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { EventsToday } from '@/screens/Events';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <EventsToday />
    </Suspense>
  );
}
