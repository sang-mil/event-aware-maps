import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Splash } from '@/screens/Start';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Splash />
    </Suspense>
  );
}
