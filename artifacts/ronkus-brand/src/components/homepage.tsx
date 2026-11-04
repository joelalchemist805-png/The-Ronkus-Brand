import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Instagram,
  Search,
  X,
} from 'lucide-react';
import { communityImages, testimonialImages } from '@/data/brand-images';
import { ProductCard } from '@/components/product-card';
import { HomeAnchorLink } from '@/components/site-layout';
import { getCategoryPath } from '@/lib/catalog';
import { Link } from 'wouter';
import { filterProducts } from '@/lib/shop';
import { useCategories, useFeaturedProducts } from '@/lib/store-api';

const instagramUrl = 'https://instagram.com/the_ronkus_brand?dlrf=MTBzaDJjY3dybGhlOA%3D%3D';
const facebookUrl = 'https://www.facebook.com/share/14sWXoMEgGM/';

function Hero() {
  return (
    <section className="hero-section" id="home">
      <div className="page-shell hero-grid">
        <div className="hero-copy fade-up">
          <h1>We Make Your <em>Outfits</em> Complete.</h1>
          <p className="hero-description">
            Discover handcrafted footwear, expressive fashion, statement accessories and personalized pieces made to complement your style.
          </p>
          <div className="hero-actions">
            <HomeAnchorLink className="button-primary" id="products">Shop Collection <ArrowRight size={16} /></HomeAnchorLink>
            <HomeAnchorLink className="button-outline" id="community">Join the Community</HomeAnchorLink>
          </div>
          <div className="hero-footnote">
            <span className="gold-rule" />
            <span>Thoughtful details, with a distinctly personal touch.</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo-frame">
            <img src="/assets/fashion-editorial.jpg" alt="Ronkus Brand fashion, expressive footwear and a vivid patterned shirt" width="1000" height="1200" fetchPriority="high" decoding="async" />
          </div>
          <div className="hero-photo-caption">
            <span>Wear what feels like you</span>
            <ArrowDown size={16} />
          </div>
          <div className="hero-stamp" aria-hidden="true">
            <span>THE</span>
            <strong>R</strong>
            <span>RONKUS<br />BRAND</span>
          </div>
          <span className="hero-index" aria-hidden="true">01 / 04</span>
        </div>
      </div>
      <div className="hero-bottom-line" aria-hidden="true" />
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
      {intro && <p className="section-intro">{intro}</p>}
    </div>
  );
}

function CategorySection() {
  const query = useCategories();

  return (
    <section className="category-section page-shell" id="categories">
      <div className="category-heading-row">
        <SectionHeading eyebrow="Find your finishing touch" title="Shop by Category" />
        <p className="category-note">Pieces for the way you move, make and show up.</p>
      </div>
      {query.isPending && (
        <div className="category-grid" aria-label="Loading categories">
          {Array.from({ length: 6 }, (_, index) => <div className="category-card-skeleton" key={index} />)}
        </div>
      )}
      {query.isError && (
        <div className="store-query-error" role="alert">
          <p>We could not load categories.</p>
          <button className="commerce-primary-button" type="button" onClick={() => void query.refetch()}>Try again</button>
        </div>
      )}
      {query.data?.length === 0 && <p className="category-empty-state">Collections are being prepared.</p>}
      {query.data && query.data.length > 0 && <div className="category-grid">
        {query.data.map((category, index) => (
          <Link
            className={`category-card category-card-${index + 1}`}
            href={getCategoryPath(category)}
            key={category.id}
          >
            <img src={category.image_path} alt="" width="640" height="480" loading="lazy" decoding="async" />
            <span className="category-shade" />
            <span className="category-card-content">
              <span className="category-number">{String(index + 1).padStart(2, '0')}</span>
              <strong>{category.name}</strong>
              <span className="category-subcategories">
                {category.subcategories.slice(0, 3).map(({ name }) => name).join(' · ')}
              </span>
            </span>
            <span className="category-arrow" aria-hidden="true"><ArrowRight size={18} /></span>
          </Link>
        ))}
      </div>}
    </section>
  );
}

function ProductSection({
  activeCategory,
  onCategoryChange,
  searchText,
  onSearchChange,
}: {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  searchText: string;
  onSearchChange: (query: string) => void;
}) {
  const featuredQuery = useFeaturedProducts();
  const categoriesQuery = useCategories();
  if (featuredQuery.isPending) {
    return (
      <section className="product-section" id="products">
        <div className="page-shell">
          <SectionHeading eyebrow="Considered details, everyday character" title="Featured Products" intro="A few favourites from our world of personal, expressive style." />
          <div className="product-grid product-grid-skeleton" aria-label="Loading featured products">
            {Array.from({ length: 3 }, (_, index) => <div className="product-card-skeleton" key={index} />)}
          </div>
        </div>
      </section>
    );
  }
  if (featuredQuery.isError) {
    return (
      <section className="product-section" id="products">
        <div className="page-shell store-query-error" role="alert">
          <p>We could not load featured products.</p>
          <button className="commerce-primary-button" type="button" onClick={() => void featuredQuery.refetch()}>Try again</button>
        </div>
      </section>
    );
  }
  const featuredProducts = featuredQuery.data;
  if (featuredProducts.length === 0) return null;
  const filteredProducts = filterProducts(featuredProducts, searchText, activeCategory);

  return (
    <section className="product-section" id="products">
      <div className="page-shell">
        <div className="product-heading-row">
          <SectionHeading
            eyebrow="Considered details, everyday character"
            title="Featured Products"
            intro="A few favourites from our world of personal, expressive style."
          />
          <span className="featured-count">{filteredProducts.length} OF {featuredProducts.length}</span>
        </div>
        <div className="product-controls">
          <label className="product-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search featured products</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search the collection"
            />
            {searchText && (
              <button type="button" aria-label="Clear product search" onClick={() => onSearchChange('')}>
                <X size={16} />
              </button>
            )}
          </label>
          <label className="product-category-filter">
            <span>Category</span>
            <select value={activeCategory} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="all">All categories</option>
              {categoriesQuery.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        </div>
        {categoriesQuery.isError && (
          <div className="store-query-error" role="alert">
            <p>Category filters could not be loaded.</p>
            <button className="commerce-secondary-button" type="button" onClick={() => void categoriesQuery.refetch()}>Try again</button>
          </div>
        )}
        {filteredProducts.length > 0 ? (
          <div className="product-grid">
            {filteredProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
          </div>
        ) : (
          <div className="products-empty-state">
            <p className="eyebrow">No matches yet</p>
            <h3>{`No featured products match “${searchText.trim()}”.`}</h3>
            <p>
              Try another search, or clear the category filter to see the featured collection.
            </p>
            <button
              className="commerce-secondary-button"
              type="button"
              onClick={() => {
                onSearchChange('');
                onCategoryChange('all');
              }}
            >
              View all featured products
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CraftsmanshipSection() {
  return (
    <section className="craft-section">
      <div className="page-shell craft-layout">
        <div className="craft-copy">
          <p className="eyebrow">Rooted in care. Made with purpose.</p>
          <h2>Craftsmanship<br />You Can <em>Trust.</em></h2>
          <p>
            Registered and built on a passion for craftsmanship, creativity and personal expression, The Ronkus Brand brings together distinctive fashion and handmade quality.
          </p>
          <span className="craft-signature">The Ronkus Brand</span>
        </div>
        <figure className="certificate-frame">
          <img src="/assets/cac-registration.jpg" alt="The Ronkus Brand Certificate of Registration from the Corporate Affairs Commission" width="900" height="1100" loading="lazy" decoding="async" />
          <figcaption>Registration document</figcaption>
        </figure>
        <span className="craft-side-note" aria-hidden="true">DETAILS MATTER · MADE WITH CARE ·</span>
      </div>
    </section>
  );
}

function CarouselSection({
  items,
  testimonials = false,
}: {
  items: { src: string; alt: string }[];
  testimonials?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollCarousel = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (track) {
      track.scrollBy({
        left: direction * Math.max(track.clientWidth * 0.72, 240),
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className={`carousel-shell${testimonials ? '' : ' community-carousel'}`}>
      <div
        ref={trackRef}
        className={`carousel-track ${testimonials ? 'testimonial-track' : 'community-track'}`}
        role="region"
        aria-label={testimonials ? 'Customer testimonials' : 'Ronkus community photos'}
        tabIndex={0}
      >
        {items.map((item, index) => (
          <figure className="carousel-item" key={item.src}>
            <img src={item.src} alt={item.alt} width="640" height="760" loading="lazy" decoding="async" />
            <figcaption className="sr-only">
              {testimonials ? `Customer testimonial ${index + 1}` : item.alt}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="carousel-controls">
        <button
          type="button"
          aria-label={`Previous ${testimonials ? 'testimonial' : 'community'} images`}
          onClick={() => scrollCarousel(-1)}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          type="button"
          aria-label={`Next ${testimonials ? 'testimonial' : 'community'} images`}
          onClick={() => scrollCarousel(1)}
        >
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

function TestimonialsSection() {
  return (
    <section className="testimonials-section page-shell">
      <div className="testimonial-heading">
        <div>
          <p className="eyebrow">A little love, shared</p>
          <h2 className="section-title">Loved by Our Customers</h2>
        </div>
        <p className="carousel-hint">Swipe to see more <ArrowRight size={15} /></p>
      </div>
      <CarouselSection items={testimonialImages} testimonials />
    </section>
  );
}

function CommunitySection() {
  return (
    <section className="community-section" id="community">
      <div className="page-shell">
        <div className="community-heading">
          <div>
            <p className="eyebrow">People make the story</p>
            <h2 className="section-title">Become Part of the<br /><em>Ronkus Community.</em></h2>
          </div>
          <div className="community-copy">
            <p>Style is even better when it is shared. Discover the people, creativity and individuality behind The Ronkus Brand.</p>
            <div className="social-actions">
              <a className="button-primary" href={instagramUrl} target="_blank" rel="noopener noreferrer">
                <Instagram size={16} /> Follow on Instagram
              </a>
              <a className="social-text-link" href={facebookUrl} target="_blank" rel="noopener noreferrer">Find us on Facebook <ArrowRight size={14} /></a>
            </div>
          </div>
        </div>
      </div>
      <CarouselSection items={communityImages} />
    </section>
  );
}

function AcademySection() {
  return (
    <section className="academy-section" id="academy">
      <div className="page-shell academy-inner">
        <p className="eyebrow">Learn the work behind the work</p>
        <h2>Shoemaking, from the<br /><em>first step forward.</em></h2>
        <p>
          Turn your interest in shoemaking into practical skills with The Ronkus Brand Shoemaking Academy. Learn the craft while developing the creative and business skills to take your ideas further.
        </p>
        <Link className="button-light" href="/academy">Explore the Shoemaking Academy <ArrowRight size={16} /></Link>
      </div>
      <span className="academy-mark" aria-hidden="true">R</span>
    </section>
  );
}

export default function Homepage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchText, setSearchText] = useState('');

  return (
    <>
      <Hero />
      <CategorySection />
      <ProductSection
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchText={searchText}
        onSearchChange={setSearchText}
      />
      <CraftsmanshipSection />
      <TestimonialsSection />
      <CommunitySection />
      <AcademySection />
    </>
  );
}
