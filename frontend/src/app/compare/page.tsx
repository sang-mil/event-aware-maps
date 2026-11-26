import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Compare } from '@/screens/Route';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Compare />
    </Suspense>
  );
}
