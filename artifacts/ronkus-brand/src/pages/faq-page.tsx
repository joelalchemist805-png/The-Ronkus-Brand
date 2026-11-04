import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { faqItems, type FaqGroup } from '@/data/faq';
import { LogoBackdrop } from '@/components/logo-backdrop';
import { buildWhatsAppUrl } from '@/lib/shop';
import { useStoreSettings } from '@/lib/store-api';

const faqGroups: FaqGroup[] = [
  'ORDERING',
  'CUSTOM ORDERS',
  'DELIVERY & PAYMENT',
  'ABOUT & ACADEMY',
];

function FaqAccordion() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  return (
    <div className="faq-groups">
      {faqGroups.map((group, groupIndex) => (
        <section className="faq-group" key={group} aria-labelledby={`faq-group-${groupIndex}`}>
          <h2 id={`faq-group-${groupIndex}`}>{group}</h2>
          <div className="faq-accordion">
            {faqItems.map((item, index) => {
              if (item.group !== group) return null;
              const isOpen = openQuestion === index;
              const questionId = `faq-question-${index}`;
              const answerId = `faq-answer-${index}`;

              return (
                <article className={`faq-item${isOpen ? ' is-open' : ''}`} key={questionId}>
                  <h3>
                    <button
                      className="faq-question"
                      id={questionId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={() => setOpenQuestion(isOpen ? null : index)}
                    >
                      <span>{item.question}</span>
                      <span className="faq-toggle-mark" aria-hidden="true" />
                    </button>
                  </h3>
                  <div
                    className="faq-answer"
                    id={answerId}
                    role="region"
                    aria-labelledby={questionId}
                    aria-hidden={!isOpen}
                  >
                    <div className="faq-answer-inner">
                      <p>{item.answer}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function FaqPage() {
  const settings = useStoreSettings();
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  }).replace(/</g, '\\u003c');

  return (
    <section className="backdrop-page faq-page">
      <LogoBackdrop density="high" />
      <div className="faq-page-content">
        <header className="faq-header page-shell">
          <p className="eyebrow">Help Centre</p>
          <h1>Frequently Asked Questions</h1>
          <p>Everything you need to know about ordering, custom pieces and delivery. Can't find your answer? Message us on WhatsApp.</p>
        </header>
        <div className="faq-content">
          <FaqAccordion />
        </div>
        <section className="faq-cta">
          <div className="page-shell faq-cta-inner">
            <div>
              <p className="eyebrow">We are happy to help</p>
              <h2>Still have a question?</h2>
            </div>
            {settings.data?.whatsapp_number ? (
              <a
                className="button-primary"
                href={buildWhatsAppUrl('Hello The Ronkus Brand, I have a question.', settings.data.whatsapp_number)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={16} /> Chat with us on WhatsApp
              </a>
            ) : (
              <button
                className="button-primary"
                type="button"
                disabled={!settings.isError}
                onClick={() => void settings.refetch()}
              >
                {settings.isError ? 'Retry WhatsApp contact' : 'Loading WhatsApp contact'}
              </button>
            )}
          </div>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </section>
  );
}
