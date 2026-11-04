import { ArrowDown, ArrowRight, Check, Clock3, MessageCircle } from 'lucide-react';
import { LogoBackdrop } from '@/components/logo-backdrop';
import { academyData } from '@/data/academy';
import { formatNaira, buildWhatsAppUrl } from '@/lib/shop';
import { useStoreSettings } from '@/lib/store-api';

function academyEnquiryUrl(message: string, whatsappNumber: string): string {
  return buildWhatsAppUrl(`${academyData.whatsappMessagePrefix}${message}`, whatsappNumber);
}

function AcademyPage() {
  const settings = useStoreSettings();
  const whatsappNumber = settings.data?.whatsapp_number;
  const isAdmissionOpen = academyData.admissionStatus === 'open';
  const primaryLabel = isAdmissionOpen
    ? academyData.enquireButton
    : academyData.waitlistButton;
  const primaryMessage = isAdmissionOpen
    ? academyData.enquiryMessage
    : academyData.waitlistMessage;

  const courseStructuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: academyData.title,
    description: academyData.intro,
    provider: {
      '@type': 'Organization',
      name: academyData.providerName,
    },
    offers: academyData.programmes.map((programme) => ({
      '@type': 'Offer',
      name: `${programme.durationMonths} ${academyData.programmeDurationSuffix}`,
      price: programme.price,
      priceCurrency: 'NGN',
    })),
  }).replace(/</g, '\\u003c');

  return (
    <section className="backdrop-page academy-page">
      <LogoBackdrop density="high" />
      <div className="academy-page-content">
        {settings.isError && (
          <div className="store-query-error page-shell" role="alert">
            <p>Store contact details could not be loaded.</p>
            <button className="commerce-secondary-button" type="button" onClick={() => void settings.refetch()}>Try again</button>
          </div>
        )}
        <header className="academy-hero">
          <div className="page-shell academy-hero-inner">
            <p className="eyebrow">{academyData.heroEyebrow}</p>
            <h1>{academyData.title}</h1>
            <div className="academy-badges">
              <span className="academy-badge"><Clock3 size={15} /> {academyData.physicalTrainingBadge}</span>
              <span className={`academy-badge academy-status ${isAdmissionOpen ? 'is-open' : 'is-closed'}`}>
                {isAdmissionOpen ? academyData.admissionOpenBadge : academyData.admissionClosedBadge}
              </span>
            </div>
            <p className="academy-hero-intro">{academyData.intro}</p>
            <div className="academy-hero-actions">
              {whatsappNumber ? (
                <a className="button-primary" href={academyEnquiryUrl(primaryMessage, whatsappNumber)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} /> {primaryLabel}
                </a>
              ) : (
                <button className="button-primary" type="button" disabled>{primaryLabel}</button>
              )}
              <a className="button-outline" href="#academy-programmes">
                {academyData.viewProgrammesButton} <ArrowDown size={16} />
              </a>
            </div>
          </div>
        </header>

        <section className="academy-content-section page-shell" aria-labelledby="academy-learning-title">
          <div className="academy-section-heading">
            <p className="eyebrow">{academyData.learningEyebrow}</p>
            <h2 id="academy-learning-title">{academyData.learningHeading}</h2>
          </div>
          <div className="academy-learning-grid">
            {academyData.learningOutcomes.map((outcome, index) => (
              <article className="academy-learning-card" key={outcome}>
                <span className="academy-card-index">0{index + 1}</span>
                <h3>{outcome}</h3>
              </article>
            ))}
          </div>
        </section>

        <section
          className="academy-content-section academy-programmes"
          id="academy-programmes"
          aria-labelledby="academy-programmes-title"
        >
          <div className="page-shell">
            <div className="academy-section-heading">
              <p className="eyebrow">{academyData.programmesEyebrow}</p>
              <h2 id="academy-programmes-title">{academyData.programmesHeading}</h2>
            </div>
            <div className="academy-programme-grid">
              {academyData.programmes.map((programme) => (
                <article className="academy-programme-card" key={programme.durationMonths}>
                  <p className="academy-programme-duration">
                    {programme.durationMonths} {academyData.programmeDurationSuffix}
                  </p>
                  <p className="academy-programme-price">{formatNaira(programme.price)}</p>
                  <h3>{programme.subtitle}</h3>
                  {whatsappNumber ? (
                    <a
                      className="button-primary"
                      href={academyEnquiryUrl(
                        academyData.programmeEnquiryMessageTemplate.replace(
                          '{durationMonths}',
                          `${programme.durationMonths}${academyData.programmeEnquiryDurationSuffix}`,
                        ),
                        whatsappNumber,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={16} /> {academyData.programmeEnquireButton}
                    </a>
                  ) : (
                    <button className="button-primary" type="button" disabled>{academyData.programmeEnquireButton}</button>
                  )}
                </article>
              ))}
            </div>
            <p className="academy-fees-note">
              {academyData.feesNote}
            </p>
          </div>
        </section>

        <section className="academy-content-section page-shell" aria-labelledby="academy-benefits-title">
          <div className="academy-section-heading">
            <p className="eyebrow">{academyData.benefitsEyebrow}</p>
            <h2 id="academy-benefits-title">{academyData.benefitsHeading}</h2>
          </div>
          <ul className="academy-benefits-list">
            {academyData.benefits.map((benefit) => (
              <li key={benefit}><Check size={18} aria-hidden="true" /> {benefit}</li>
            ))}
          </ul>
        </section>

        <section className="academy-good-to-know page-shell" aria-labelledby="academy-notice-title">
          <div className="academy-notice">
            <p className="eyebrow">{academyData.noticeEyebrow}</p>
            <h2 id="academy-notice-title">{academyData.noticeHeading}</h2>
            <p>{academyData.equipmentNotice}</p>
          </div>
          <p className="academy-location">{academyData.trainingLocation}</p>
        </section>

        <section className="academy-content-section academy-joining page-shell" aria-labelledby="academy-joining-title">
          <div className="academy-section-heading">
            <p className="eyebrow">{academyData.joiningEyebrow}</p>
            <h2 id="academy-joining-title">{academyData.joiningHeading}</h2>
          </div>
          <ol className="academy-steps">
            {academyData.joiningSteps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {academyData.gallery.length > 0 && (
          <section className="academy-content-section page-shell" aria-labelledby="academy-gallery-title">
            <div className="academy-section-heading">
              <p className="eyebrow">{academyData.galleryEyebrow}</p>
              <h2 id="academy-gallery-title">{academyData.galleryHeading}</h2>
            </div>
            <div className="academy-gallery">
              {academyData.gallery.map((image) => (
                <img src={image.src} alt={image.alt} key={image.src} width="640" height="480" loading="lazy" decoding="async" />
              ))}
            </div>
          </section>
        )}

        <section className="academy-final-cta">
          <div className="page-shell academy-final-cta-inner">
            <div>
              <p className="eyebrow">{academyData.finalEyebrow}</p>
              <h2>{academyData.finalHeading}</h2>
            </div>
            {whatsappNumber ? (
              <a className="button-primary" href={academyEnquiryUrl(primaryMessage, whatsappNumber)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> {primaryLabel} <ArrowRight size={16} />
              </a>
            ) : (
              <button className="button-primary" type="button" disabled>{primaryLabel}</button>
            )}
          </div>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: courseStructuredData }} />
    </section>
  );
}

export { AcademyPage };
