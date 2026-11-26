import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Search } from '@/screens/Route';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Search />
    </Suspense>
  );
}
