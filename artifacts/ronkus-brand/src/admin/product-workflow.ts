import type { ProductFormValues } from './helpers.ts';
import {
  validateProductForm,
  type ProductFieldErrors,
} from './helpers.ts';
import {
  validateCustomRequest,
  validateProductOptions,
  type CustomOrderDraft,
  type OptionGroupDraft,
  type OptionValueDraft,
} from './product-config.ts';

export type ProductWizardStep = 1 | 2 | 3 | 4 | 5;

export type ProductSaveAction =
  | { type: 'insert-hidden' }
  | { type: 'upload-photo'; position: number }
  | { type: 'publish'; featured: boolean };

export type ProductSavePlan = {
  actions: ProductSaveAction[];
  remainsHiddenOnPhotoFailure: true;
  removeEarlierPhotosOnFailure: true;
};

export const colourPresets = [
  { label: 'Black', hex: '#000000' },
  { label: 'White', hex: '#FFFFFF' },
  { label: 'Red', hex: '#C62828' },
  { label: 'Pink', hex: '#F48FB1' },
  { label: 'Blue', hex: '#1565C0' },
  { label: 'Green', hex: '#2E7D32' },
  { label: 'Yellow', hex: '#F9A825' },
  { label: 'Orange', hex: '#EF6C00' },
  { label: 'Purple', hex: '#6A1B9A' },
  { label: 'Brown', hex: '#6D4C41' },
  { label: 'Grey', hex: '#757575' },
  { label: 'Gold', hex: '#C9A227' },
  { label: 'Navy', hex: '#1A237E' },
  { label: 'Cream', hex: '#F5F0E1' },
] as const;

export function colourPresetToValue(
  colour: { label: string; hex: string },
  existingValues: readonly OptionValueDraft[],
): OptionValueDraft {
  const base = colour.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colour';
  const existing = new Set(existingValues.map(({ value }) => value));
  let value = base;
  let suffix = 2;
  while (existing.has(value)) {
    value = `${base}-${suffix}`;
    suffix += 1;
  }
  return {
    value,
    label: colour.label,
    price_delta: '0',
    swatch: colour.hex,
    available: true,
  };
}

export function validateWizardStep(
  step: ProductWizardStep,
  values: ProductFormValues,
  options: OptionGroupDraft[],
  customOrder: CustomOrderDraft,
): { productErrors: ProductFieldErrors; configErrors: string[] } {
  if (step === 1) {
    const errors = validateProductForm(values);
    if (!values.description.trim()) errors.description = 'Add a short description.';
    return { productErrors: errors, configErrors: [] };
  }
  if (step === 3) {
    return { productErrors: {}, configErrors: validateProductOptions(options).map(({ message }) => message) };
  }
  if (step === 4) {
    return { productErrors: {}, configErrors: validateCustomRequest(customOrder).map(({ message }) => message) };
  }
  return { productErrors: {}, configErrors: [] };
}

export function planProductSave(
  photoCount: number,
  showOnStorefront: boolean,
  featured: boolean,
): ProductSavePlan {
  const actions: ProductSaveAction[] = [{ type: 'insert-hidden' }];
  for (let position = 1; position <= photoCount; position += 1) {
    actions.push({ type: 'upload-photo', position });
  }
  if (showOnStorefront) actions.push({ type: 'publish', featured });
  return {
    actions,
    remainsHiddenOnPhotoFailure: true,
    removeEarlierPhotosOnFailure: true,
  };
}

export function photoFailureNotice(position: number): string {
  return `Your product was saved as hidden but photo ${position} did not upload. Add it here.`;
}
