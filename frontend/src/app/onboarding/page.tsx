import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Onboarding } from '@/screens/Start';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Onboarding />
    </Suspense>
  );
}
