import type { ProductSummary } from '@/lib/types';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        // Open Food Facts occasionally repeats a barcode across pages; the index keeps keys unique.
        <li key={`${product.barcode}-${index}`}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
