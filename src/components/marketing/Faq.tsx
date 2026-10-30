'use client';

import { ChevronDown } from 'lucide-react';
import { useLandingContent } from '@/hooks/useLandingContent';

/** Landing FAQ, edited at /admin/landing. Hidden when no question is visible. */
export function Faq() {
  const content = useLandingContent();
  const faqs = content?.faqs.filter((f) => f.visible) ?? [];
  if (faqs.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };

  return (
    <section id="preguntas" className="py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Preguntas frecuentes</p>
          <h2 className="text-3xl sm:text-4xl font-bold">¿Tienes dudas?</h2>
        </div>

        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.id} className="group bg-card border border-border rounded-xl px-5 open:shadow-sm">
              <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none font-medium text-sm [&::-webkit-details-marker]:hidden">
                {f.question}
                <ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
