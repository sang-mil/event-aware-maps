import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Brand } from '@/screens/Preview';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Brand />
    </Suspense>
  );
}
