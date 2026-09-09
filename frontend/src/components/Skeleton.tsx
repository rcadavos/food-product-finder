import { Card, Skeleton } from './ui';

// Re-exported so the many `import { Skeleton } from '@/components'` call sites keep working
// now that the primitive itself lives in `components/ui`.
export { Skeleton } from './ui';

/** Mirrors ProductCard's geometry so the grid does not jump when results arrive. */
export function ProductCardSkeleton() {
  return (
    <Card padding="none" aria-hidden="true" className="flex h-full flex-col overflow-hidden">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-3 h-7 w-16 rounded-full" />
      </div>
    </Card>
  );
}
