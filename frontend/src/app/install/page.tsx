'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loading } from '@/components/ui';
import { Install } from '@/screens/Start';

function Inner() {
  const q = useSearchParams();
  return <Install from={q.get('from')} event={q.get('event')} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Inner />
    </Suspense>
  );
}
