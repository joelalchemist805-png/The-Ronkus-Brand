import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Instagram, Mail, MapPin, MessageCircle, Send } from 'lucide-react';
import { Link } from 'wouter';
import { LogoBackdrop } from '@/components/logo-backdrop';
import { contactData } from '@/data/contact';
import { getCategoryPath, slugifyLabel } from '@/lib/catalog';
import { buildWhatsAppUrl } from '@/lib/shop';
import { useStoreSettings } from '@/lib/store-api';

type ContactFieldErrors = {
  name?: string;
  message?: string;
  whatsapp?: string;
};

function ContactComposer({ whatsappNumber }: { whatsappNumber: string | null }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState(contactData.contact.topics[0]);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: ContactFieldErrors = {};
    if (!name.trim()) nextErrors.name = contactData.contact.nameError;
    if (!message.trim()) nextErrors.message = contactData.contact.messageError;
    setErrors(nextErrors);

    if (nextErrors.name) {
      nameRef.current?.focus();
      return;
    }
    if (nextErrors.message) {
      messageRef.current?.focus();
      return;
    }
    if (!whatsappNumber) {
      setErrors({ whatsapp: 'WhatsApp contact details are unavailable. Please try again later.' });
      return;
    }

    const whatsappMessage = [
      contactData.contact.whatsappMessageGreeting,
      '',
      `${contactData.contact.whatsappNameLabel}: ${name.trim()}`,
      `${contactData.contact.whatsappTopicLabel}: ${topic}`,
      `${contactData.contact.whatsappMessageLabel}: ${message.trim()}`,
    ].join('\n');
    window.open(buildWhatsAppUrl(whatsappMessage, whatsappNumber), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="contact-composer">
      <h3>{contactData.contact.composerHeading}</h3>
      <form noValidate onSubmit={submitMessage}>
        <div className="contact-form-field">
          <label htmlFor="contact-name">{contactData.contact.nameLabel}</label>
          <input
            id="contact-name"
            name="name"
            ref={nameRef}
            autoComplete="name"
            placeholder={contactData.contact.namePlaceholder}
            value={name}
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'contact-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          {errors.name && <p className="contact-field-error" id="contact-name-error" role="alert">{errors.name}</p>}
        </div>
        <div className="contact-form-field">
          <label htmlFor="contact-topic">{contactData.contact.topicLabel}</label>
          <select
            id="contact-topic"
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            {contactData.contact.topics.map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>
        <div className="contact-form-field">
          <label htmlFor="contact-message">{contactData.contact.messageLabel}</label>
          <textarea
            id="contact-message"
            name="message"
            ref={messageRef}
            placeholder={contactData.contact.messagePlaceholder}
            rows={5}
            value={message}
            required
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? 'contact-message-error' : undefined}
            onChange={(event) => {
              setMessage(event.target.value);
              if (errors.message) setErrors((current) => ({ ...current, message: undefined }));
            }}
          />
          {errors.message && <p className="contact-field-error" id="contact-message-error" role="alert">{errors.message}</p>}
        </div>
        <button className="button-primary contact-submit" type="submit">
          <Send size={16} aria-hidden="true" /> {contactData.contact.submitButton}
        </button>
        {errors.whatsapp && <p className="contact-field-error" role="alert">{errors.whatsapp}</p>}
      </form>
    </div>
  );
}

function ContactPage() {
  const settings = useStoreSettings();
  const whatsappNumber = settings.data?.whatsapp_number ?? null;
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: contactData.organization.name,
    url: contactData.organization.url,
    logo: contactData.organization.logo,
    telephone: contactData.organization.telephone,
    email: contactData.organization.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: contactData.organization.addressLocality,
      addressRegion: contactData.organization.addressRegion,
      addressCountry: contactData.organization.addressCountry,
    },
    sameAs: contactData.organization.sameAs,
  }).replace(/</g, '\\u003c');

  return (
    <section className="backdrop-page contact-page">
      <LogoBackdrop density="high" />
      <div className="contact-page-content">
        {settings.isError && (
          <div className="store-query-error page-shell" role="alert">
            <p>Store contact details could not be loaded.</p>
            <button className="commerce-secondary-button" type="button" onClick={() => void settings.refetch()}>Try again</button>
          </div>
        )}
        <header className="contact-hero">
          <div className="contact-shell">
            <p className="eyebrow">{contactData.hero.eyebrow}</p>
            <h1>{contactData.hero.title}</h1>
            <p className="contact-hero-tagline">{contactData.hero.tagline}</p>
            <div className="contact-hero-actions">
              {whatsappNumber ? (
                <a className="button-primary" href={buildWhatsAppUrl(contactData.hero.whatsappMessage, whatsappNumber)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} aria-hidden="true" /> {contactData.hero.whatsappButton}
                </a>
              ) : (
                <button className="button-primary" type="button" disabled>{contactData.hero.whatsappButton}</button>
              )}
              <a className="button-outline" href="#our-story">
                {contactData.hero.storyButton} <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            {contactData.showRegisteredNote && (
              <p className="contact-trust-note">{contactData.hero.registeredNote}</p>
            )}
          </div>
        </header>

        <section className="contact-section contact-shell contact-story" id="our-story" aria-labelledby="contact-story-heading">
          <div className="contact-section-heading">
            <h2 id="contact-story-heading">{contactData.story.heading}</h2>
          </div>
          <div className="contact-story-copy">
            {contactData.story.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </section>

        <section className="contact-section contact-shell" aria-labelledby="contact-mission-heading">
          <div className="contact-section-heading">
            <h2 id="contact-mission-heading">{contactData.missionVision.heading}</h2>
          </div>
          <div className="contact-mission-grid">
            {contactData.missionVision.cards.map((card, index) => (
              <article className="contact-mission-card" key={card.title}>
                <span className="contact-card-number">0{index + 1}</span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="contact-section contact-shell" aria-labelledby="contact-categories-heading">
          <div className="contact-section-heading">
            <h2 id="contact-categories-heading">{contactData.categories.heading}</h2>
          </div>
          <div className="contact-category-grid">
            {contactData.categories.items.map((item, index) => {
              return (
                <Link
                  className="contact-category-card"
                  href={getCategoryPath({ slug: slugifyLabel(item.categoryName) })}
                  key={item.categoryName}
                >
                  <span className="contact-card-number">0{index + 1}</span>
                  <h3>{item.categoryName}</h3>
                  <p>{item.description}</p>
                  <span className="contact-category-arrow" aria-hidden="true"><ArrowRight size={17} /></span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="contact-section contact-shell" aria-labelledby="contact-reasons-heading">
          <div className="contact-section-heading">
            <h2 id="contact-reasons-heading">{contactData.reasons.heading}</h2>
          </div>
          <ol className="contact-reasons-list">
            {contactData.reasons.items.map((item, index) => (
              <li className="contact-reason" key={item.title}>
                <span className="contact-reason-number">{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {contactData.showFounder && (
          <section className="contact-section contact-shell contact-founder" aria-labelledby="contact-founder-heading">
            <div className="contact-section-heading">
              <h2 id="contact-founder-heading">{contactData.founder.heading}</h2>
            </div>
            <div className={`contact-founder-card${contactData.founder.founderPhoto ? ' has-photo' : ''}`}>
              {contactData.founder.founderPhoto && (
                <img src={contactData.founder.founderPhoto} alt={contactData.founder.name} width="520" height="650" loading="lazy" decoding="async" />
              )}
              <div>
                <h3>{contactData.founder.name}</h3>
                <p>{contactData.founder.description}</p>
              </div>
            </div>
          </section>
        )}

        <section className="contact-section contact-shell contact-details-section" id="contact" aria-labelledby="contact-details-heading">
          <div className="contact-section-heading">
            <h2 id="contact-details-heading">{contactData.contact.heading}</h2>
          </div>
          <div className="contact-details-grid">
            <div className="contact-details-column">
              <article className="contact-detail-card">
                <div className="contact-detail-icon"><MessageCircle size={19} aria-hidden="true" /></div>
                <div className="contact-detail-copy">
                  <h3>{contactData.contact.whatsappLabel}</h3>
                  <p>{whatsappNumber ?? 'WhatsApp details temporarily unavailable'}</p>
                  {whatsappNumber && (
                    <a className="contact-inline-link" href={buildWhatsAppUrl(contactData.contact.whatsappMessage, whatsappNumber)} target="_blank" rel="noopener noreferrer">
                      {contactData.hero.whatsappButton} <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </article>
              <article className="contact-detail-card">
                <div className="contact-detail-icon"><Mail size={19} aria-hidden="true" /></div>
                <div className="contact-detail-copy">
                  <h3>{contactData.contact.emailLabel}</h3>
                  <a href={`mailto:${contactData.contact.email}`}>{contactData.contact.email}</a>
                </div>
              </article>
              <article className="contact-detail-card">
                <div className="contact-detail-icon"><Instagram size={19} aria-hidden="true" /></div>
                <div className="contact-detail-copy">
                  <h3>{contactData.contact.instagramLabel}</h3>
                  <a href={contactData.contact.instagramUrl} target="_blank" rel="noopener noreferrer">
                    {contactData.contact.instagramHandle}
                  </a>
                </div>
              </article>
              <article className="contact-detail-card">
                <div className="contact-detail-icon"><MapPin size={19} aria-hidden="true" /></div>
                <div className="contact-detail-copy">
                  <h3>{contactData.contact.locationLabel}</h3>
                  <p>{contactData.contact.location}</p>
                </div>
              </article>
              <p className="contact-reply-note">{contactData.contact.replyNote}</p>
              {contactData.contact.socialLinks.some((social) => social.url) && (
                <div className="contact-extra-socials" aria-label={contactData.contact.extraSocialsLabel}>
                  {contactData.contact.socialLinks.filter((social) => social.url).map((social) => (
                    <a href={social.url} key={social.label} target="_blank" rel="noopener noreferrer">
                      {social.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <ContactComposer whatsappNumber={whatsappNumber} />
          </div>
        </section>

        <section className="contact-final-cta">
          <div className="contact-shell contact-final-cta-inner">
            <h2>{contactData.finalCta.heading}</h2>
            <div className="contact-final-cta-actions">
              {whatsappNumber ? (
                <a className="button-light" href={buildWhatsAppUrl(contactData.finalCta.whatsappMessage, whatsappNumber)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} aria-hidden="true" /> {contactData.finalCta.whatsappButton}
                </a>
              ) : (
                <button className="button-light" type="button" disabled>{contactData.finalCta.whatsappButton}</button>
              )}
              <Link className="button-outline contact-final-shop-link" href="/shop">
                {contactData.finalCta.shopButton} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </section>
  );
}

export default ContactPage;
