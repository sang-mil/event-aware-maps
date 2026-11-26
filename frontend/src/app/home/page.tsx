import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Home } from '@/screens/Home';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}
