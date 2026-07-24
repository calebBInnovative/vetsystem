import { ProductDetailView } from './ProductDetailView';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <ProductDetailView />;
}
