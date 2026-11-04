import { Link } from 'wouter';
import type { ProductWithImages } from '@/lib/db-types';
import { fromPrice } from '@/lib/pricing';
import { formatNaira } from '@/lib/shop';

const audienceLabels = {
  male: 'Male',
  female: 'Female',
  unisex: 'Unisex',
} as const;

const availabilityLabels = {
  ready_to_order: 'Ready to Order',
  made_to_order: 'Made to Order',
  out_of_stock: 'Out of stock',
} as const;

export function ProductCard({ product, index = 0 }: { product: ProductWithImages; index?: number }) {
  const image = product.product_images[0];
  const price = formatNaira(fromPrice(product));
  const priceText = product.options.length > 0 ? `From ${price}` : price;

  return (
    <article className="product-card">
      <Link className="product-card-link" href={`/product/${product.slug}`}>
        <div className="product-image-wrap">
          {image && (
            <img
              src={image.url}
              alt={image.alt_text || product.name}
              width="640"
              height="640"
              loading="lazy"
              decoding="async"
            />
          )}
          <span className="product-index">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <div className="product-card-body">
          <div className="product-title-row">
            <div>
              <p className="product-category">{audienceLabels[product.audience]}</p>
              <h3>{product.name}</h3>
            </div>
            <span className={`product-availability product-availability-${product.availability}`}>
              {availabilityLabels[product.availability]}
            </span>
          </div>
          <p className="product-card-price">
            {priceText}{product.price_suffix ? ` ${product.price_suffix}` : ''}
          </p>
        </div>
      </Link>
    </article>
  );
}
