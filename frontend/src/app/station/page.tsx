import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Station } from '@/screens/Station';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Station />
    </Suspense>
  );
}
