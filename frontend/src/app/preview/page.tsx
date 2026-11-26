import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { PreviewIndex } from '@/screens/Preview';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PreviewIndex />
    </Suspense>
  );
}
