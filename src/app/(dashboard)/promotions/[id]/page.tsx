// Server page — required by Next.js `output: export` for dynamic segments.
// Actual logic lives in EditPromotionClient (client component).
export function generateStaticParams() { return [{ id: '_' }]; }

import EditPromotionClient from './EditPromotionClient';

export default function EditPromotionPage() {
  return <EditPromotionClient />;
}
