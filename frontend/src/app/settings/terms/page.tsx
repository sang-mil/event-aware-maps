import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Terms } from '@/screens/Settings';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Terms />
    </Suspense>
  );
}
