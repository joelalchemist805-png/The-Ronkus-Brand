import type { ProductOptionGroup, ProductRow } from '@/lib/db-types';

export type ProductSelections = Record<string, string | string[] | number>;

function getGroupPrice(
  group: ProductOptionGroup,
  selection: ProductSelections[string] | undefined,
): number {
  if (selection === undefined) return 0;

  if (group.type === 'choice') {
    const values = (Array.isArray(selection) ? selection : [selection])
      .filter((value): value is string => typeof value === 'string');
    return values.reduce<number>((total, selected) => {
      const option = group.values.find((value) => value.value === selected && value.available);
      return total + (option?.price_delta ?? 0);
    }, 0);
  }

  const rangeValue = typeof selection === 'number' ? selection : Number.NaN;
  if (
    !Number.isFinite(rangeValue)
    || rangeValue < group.min
    || rangeValue > group.max
    || Math.abs((rangeValue - group.min) / group.step - Math.round((rangeValue - group.min) / group.step)) > 1e-8
  ) return 0;
  return (group.price_per_unit ?? 0) * rangeValue;
}

export function computeUnitPrice(product: ProductRow, selections: ProductSelections): number {
  return product.price_ngn + product.options.reduce<number>(
    (total, group) => total + getGroupPrice(group, selections[group.id]),
    0,
  );
}

export function fromPrice(product: ProductRow): number {
  return product.price_ngn + product.options.reduce<number>((total, group) => {
    if (!group.required) return total;
    if (group.type === 'range') {
      return total + (group.price_per_unit ?? 0) * group.min;
    }
    const availableValues = group.values.filter((value) => value.available);
    if (availableValues.length === 0) return total;
    const lowestChoice = Math.min(...availableValues.map(({ price_delta }) => price_delta));
    return total + lowestChoice;
  }, 0);
}
