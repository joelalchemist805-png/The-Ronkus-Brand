import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { LogoBackdrop } from '@/components/logo-backdrop';
import { ProductCard } from '@/components/product-card';
import { useCategories, useProducts } from '@/lib/store-api';
import type { CategoryWithSubcategories } from '@/lib/db-types';
import { getCategoryPath, getSubcategoryPath } from '@/lib/catalog';
import NotFound from '@/pages/not-found';

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="store-query-error page-shell" role="alert">
      <p>We could not load the shop right now.</p>
      <button className="commerce-primary-button" type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

function CategoryCards({ categories }: { categories: CategoryWithSubcategories[] }) {
  return (
    <div className="category-grid">
      {categories.map((category, index) => (
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
    </div>
  );
}

function CategoryCardsSkeleton() {
  return (
    <div className="category-grid" aria-label="Loading categories">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="category-card-skeleton" key={index} />
      ))}
    </div>
  );
}

export function ShopOverviewPage() {
  const query = useCategories();

  return (
    <section className="backdrop-page shop-overview-page">
      <LogoBackdrop density="medium" />
      <div className="shop-overview page-shell">
        <p className="eyebrow">Explore The Ronkus Brand</p>
        <h1 className="section-title">Shop by Category</h1>
        <p className="section-intro">Pieces for the way you move, make and show up.</p>
        {query.isPending && <CategoryCardsSkeleton />}
        {query.isError && <QueryError onRetry={() => void query.refetch()} />}
        {query.data?.length === 0 && (
          <div className="category-empty-state"><h2>Collections are being prepared.</h2></div>
        )}
        {query.data && query.data.length > 0 && <CategoryCards categories={query.data} />}
      </div>
    </section>
  );
}

function SubcategorySlider({
  category,
  activeSubcategory,
}: {
  category: CategoryWithSubcategories;
  activeSubcategory?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeSubcategory]);

  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    track?.scrollBy({
      left: direction * Math.max(track.clientWidth * 0.7, 180),
      behavior: 'smooth',
    });
  };
  const chips = [
    { name: 'All', href: getCategoryPath(category), active: !activeSubcategory },
    ...category.subcategories.map((subcategory) => ({
      name: subcategory.name,
      href: getSubcategoryPath(category, subcategory),
      active: activeSubcategory === subcategory.slug,
    })),
  ];

  return (
    <div className="subcategory-slider page-shell" role="region" aria-label={`${category.name} subcategories`}>
      <button className="subcategory-arrow" type="button" aria-label="Scroll subcategories left" onClick={() => scroll(-1)}>
        <ArrowLeft size={17} />
      </button>
      <div className="subcategory-track" ref={trackRef} role="list">
        {chips.map((chip) => (
          <Link
            className={`subcategory-chip${chip.active ? ' is-active' : ''}`}
            href={chip.href}
            key={chip.name}
            ref={chip.active ? activeChipRef : undefined}
            role="listitem"
            aria-current={chip.active ? 'page' : undefined}
          >
            {chip.name}
          </Link>
        ))}
      </div>
      <button className="subcategory-arrow" type="button" aria-label="Scroll subcategories right" onClick={() => scroll(1)}>
        <ArrowRight size={17} />
      </button>
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="category-product-grid" aria-label="Loading products">
      {Array.from({ length: 3 }, (_, index) => <div className="product-card-skeleton" key={index} />)}
    </div>
  );
}

function CategoryProducts({
  category,
  subcategorySlug,
}: {
  category: CategoryWithSubcategories;
  subcategorySlug?: string;
}) {
  const query = useProducts({ categorySlug: category.slug, subcategorySlug });

  if (query.isPending) return <ProductGridSkeleton />;
  if (query.isError) {
    return (
      <div className="store-query-error" role="alert">
        <p>We could not load these products.</p>
        <button className="commerce-primary-button" type="button" onClick={() => void query.refetch()}>Try again</button>
      </div>
    );
  }
  if (query.data.length === 0) {
    return (
      <div className="category-empty-state">
        <p className="eyebrow">Made with intention</p>
        <h2>New pieces arriving soon</h2>
        <p>
          {subcategorySlug
            ? `We are adding new pieces to ${category.subcategories.find(({ slug }) => slug === subcategorySlug)?.name}.`
            : `We are preparing more ${category.name.toLowerCase()} for you.`}
        </p>
      </div>
    );
  }
  return (
    <div className="category-product-grid">
      {query.data.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
    </div>
  );
}

function CategoryPageContent({
  category,
  subcategorySlug,
}: {
  category: CategoryWithSubcategories;
  subcategorySlug?: string;
}) {
  const subcategory = subcategorySlug
    ? category.subcategories.find(({ slug }) => slug === subcategorySlug)
    : undefined;
  if (subcategorySlug && !subcategory) return <NotFound />;

  return (
    <section className="category-page">
      <LogoBackdrop density="high" />
      <div className="category-page-content">
        <header className="category-banner">
          <img
            className="category-banner-image"
            src={category.image_path}
            alt={`${category.name} collection`}
            width="1600"
            height="520"
            fetchPriority="high"
            decoding="async"
          />
          <div className="category-banner-inner page-shell">
            <p className="eyebrow">The Ronkus Brand collection</p>
            <h1>{category.name}</h1>
            <p>{category.subcategories.map(({ name }) => name).join(' · ')}</p>
          </div>
        </header>
        <SubcategorySlider category={category} activeSubcategory={subcategorySlug} />
        <section className="category-products page-shell" aria-label={`${category.name} products`}>
          <div className="category-products-heading">
            <div>
              <p className="eyebrow">{subcategory?.name ?? category.name}</p>
              <h2>{subcategory ? subcategory.name : `Discover ${category.name}`}</h2>
            </div>
          </div>
          <CategoryProducts category={category} subcategorySlug={subcategorySlug} />
        </section>
      </div>
    </section>
  );
}

export function CategoryPage({
  categorySlug,
  subcategorySlug,
}: {
  categorySlug: string;
  subcategorySlug?: string;
}) {
  const query = useCategories();
  if (query.isPending) {
    return <section className="category-page"><div className="category-banner-skeleton" /></section>;
  }
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  const category = query.data.find(({ slug }) => slug === categorySlug);
  if (!category) return <NotFound />;
  return <CategoryPageContent category={category} subcategorySlug={subcategorySlug} />;
}
