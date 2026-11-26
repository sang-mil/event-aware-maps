import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Privacy } from '@/screens/Settings';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Privacy />
    </Suspense>
  );
}
