import { ProductDetailView } from './ProductDetailView';

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProductDetailView params={params} />;
}
