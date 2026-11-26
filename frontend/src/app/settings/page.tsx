import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Settings } from '@/screens/Settings';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Settings />
    </Suspense>
  );
}
