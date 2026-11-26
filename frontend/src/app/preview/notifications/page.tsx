import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Notifications } from '@/screens/Preview';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Notifications />
    </Suspense>
  );
}
