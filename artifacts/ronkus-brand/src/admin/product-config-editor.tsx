import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CustomRequestField, ProductOptionGroup } from '@/lib/db-types';
import {
  getProductConfiguration,
  updateProductCustomOrder,
  updateProductOptions,
  validateCustomFieldsWithDatabase,
  validateOptionsWithDatabase,
  type CustomOrderWrite,
  type ProductOptionsWrite,
} from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminNairaInput,
  AdminNumberInput,
  AdminSelect,
  AdminTextarea,
  AdminToggle,
  LoadingState,
} from './admin-components';
import {
  brandedApronPreset,
  createUniqueConfigId,
  customFieldFromDraft,
  customFieldToDraft,
  fabricYardagePreset,
  fieldsRoundTrip,
  optionGroupFromDraft,
  optionGroupToDraft,
  optionsRoundTrip,
  quickAddNumbers,
  reorder,
  shoeSizesPreset,
  tailoredShirtPreset,
  validateCustomRequest,
  validateProductOptions,
  type CustomFieldDraft,
  type CustomOrderDraft,
  type OptionGroupDraft,
  type OptionValueDraft,
  type ProductConfigIssue,
} from './product-config';

type DirtyChangeHandler = (dirty: boolean) => void;
type GroupType = 'choice' | 'range';
type FieldType = CustomFieldDraft['type'];

const emptyCustomOrder: CustomOrderDraft = {
  enabled: false,
  button_label: 'Request custom order',
  flow: 'whatsapp_quote',
  fee_ngn: '0',
  notice: '',
  needed_by_mode: 'off',
  fields: [],
};

function issueFor(issues: ProductConfigIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message;
}

function groupLabel(group: OptionGroupDraft): string {
  return `${group.label || 'Untitled'} · ${group.type === 'choice' ? `${group.values.length} choices` : `${group.min || '?'}–${group.max || '?'} ${group.unit}`}`;
}

function emptyChoiceValue(): OptionValueDraft {
  return { value: '', label: '', price_delta: '0', swatch: '', available: true };
}

function newCustomField(type: FieldType, label: string, id: string): CustomFieldDraft {
  const common = { id, label, required: false, help_text: '' };
  if (type === 'text' || type === 'textarea') {
    return { ...common, type, max_length: '200', placeholder: '' };
  }
  if (type === 'number') {
    return { ...common, type, min: '0', max: '100', step: '1', unit: 'cm' };
  }
  if (type === 'measurement') {
    return { ...common, type, min: '0', max: '200', unit: 'cm' };
  }
  return { ...common, type: 'choice', values: ['Option 1'] };
}

function uniqueGroup(group: OptionGroupDraft, current: OptionGroupDraft[]): OptionGroupDraft {
  return { ...group, id: createUniqueConfigId(group.id, current.map((item) => item.id), group.type) };
}

function uniqueField(field: CustomFieldDraft, current: CustomFieldDraft[]): CustomFieldDraft {
  return { ...field, id: createUniqueConfigId(field.id, current.map((item) => item.id), 'field') };
}

function changeGroupType(group: OptionGroupDraft, type: GroupType): OptionGroupDraft {
  if (group.type === type) return group;
  return type === 'choice'
    ? { id: group.id, label: group.label, required: group.required, type, multiple: false, values: [emptyChoiceValue()] }
    : { id: group.id, label: group.label, required: group.required, type, min: '1', max: '10', step: '1', unit: '', price_per_unit: '0' };
}

function changeFieldType(field: CustomFieldDraft, type: FieldType): CustomFieldDraft {
  if (field.type === type) return field;
  return newCustomField(type, field.label, field.id);
}

function moveButton(
  label: string,
  disabled: boolean,
  onClick: () => void,
) {
  return (
    <AdminButton type="button" variant="secondary" disabled={disabled} onClick={onClick}>
      {label}
    </AdminButton>
  );
}

export function ProductConfigEditor({
  productId,
  onDirtyChange,
}: {
  productId: string;
  onDirtyChange: DirtyChangeHandler;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionGroupDraft[]>([]);
  const [initialOptions, setInitialOptions] = useState<OptionGroupDraft[]>([]);
  const [customOrder, setCustomOrder] = useState<CustomOrderDraft>(emptyCustomOrder);
  const [initialCustomOrder, setInitialCustomOrder] = useState<CustomOrderDraft>(emptyCustomOrder);
  const [optionIssues, setOptionIssues] = useState<ProductConfigIssue[]>([]);
  const [customIssues, setCustomIssues] = useState<ProductConfigIssue[]>([]);
  const [optionsSaving, setOptionsSaving] = useState(false);
  const [customSaving, setCustomSaving] = useState(false);
  const [optionsSaved, setOptionsSaved] = useState(false);
  const [customSaved, setCustomSaved] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupIdEdited, setNewGroupIdEdited] = useState(false);
  const [newGroupType, setNewGroupType] = useState<GroupType>('choice');
  const [newGroupRequired, setNewGroupRequired] = useState(true);
  const [optionPreset, setOptionPreset] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldId, setNewFieldId] = useState('');
  const [newFieldIdEdited, setNewFieldIdEdited] = useState(false);
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [customPreset, setCustomPreset] = useState('');

  const optionsDirty = JSON.stringify(options) !== JSON.stringify(initialOptions);
  const customDirty = JSON.stringify(customOrder) !== JSON.stringify(initialCustomOrder);
  const isDirty = !loading && (optionsDirty || customDirty);

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    let active = true;
    void getProductConfiguration(productId)
      .then((configuration) => {
        if (!active) return;
        if (!configuration) throw new Error('Product not found.');
        const nextOptions = configuration.options.map(optionGroupToDraft);
        const nextCustomOrder: CustomOrderDraft = {
          enabled: configuration.custom_request_enabled,
          button_label: configuration.custom_request_button_label,
          flow: configuration.custom_request_flow,
          fee_ngn: String(configuration.custom_request_fee_ngn),
          notice: configuration.custom_request_notice ?? '',
          needed_by_mode: configuration.needed_by_mode,
          fields: configuration.custom_request_fields.map(customFieldToDraft),
        };
        setOptions(nextOptions);
        setInitialOptions(nextOptions);
        setCustomOrder(nextCustomOrder);
        setInitialCustomOrder(nextCustomOrder);
      })
      .catch((error: unknown) => {
        if (active) {
          const message = error instanceof Error ? error.message : 'Product settings could not be loaded.';
          setLoadError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const updateOptionGroup = (index: number, transform: (group: OptionGroupDraft) => OptionGroupDraft) => {
    setOptions((current) => current.map((group, itemIndex) => itemIndex === index ? transform(group) : group));
    setOptionsSaved(false);
  };

  const updateCustomField = (index: number, transform: (field: CustomFieldDraft) => CustomFieldDraft) => {
    setCustomOrder((current) => ({
      ...current,
      fields: current.fields.map((field, itemIndex) => itemIndex === index ? transform(field) : field),
    }));
    setCustomSaved(false);
  };

  const addGroup = () => {
    if (!newGroupLabel.trim() || !newGroupId.trim()) return;
    const newGroup: OptionGroupDraft = newGroupType === 'choice'
      ? {
          id: newGroupId.trim(),
          label: newGroupLabel.trim(),
          type: 'choice',
          required: newGroupRequired,
          multiple: false,
          values: [emptyChoiceValue()],
        }
      : {
          id: newGroupId.trim(),
          label: newGroupLabel.trim(),
          type: 'range',
          required: newGroupRequired,
          min: '1',
          max: '10',
          step: '1',
          unit: '',
          price_per_unit: '0',
        };
    setOptions((current) => [...current, newGroup]);
    setNewGroupLabel('');
    setNewGroupId('');
    setNewGroupIdEdited(false);
    setOptionsSaved(false);
  };

  const addOptionPreset = () => {
    const preset = optionPreset === 'sizes' ? shoeSizesPreset() : fabricYardagePreset();
    setOptions((current) => [...current, uniqueGroup(preset, current)]);
    setOptionPreset('');
    setOptionsSaved(false);
  };

  const addCustomField = () => {
    if (!newFieldLabel.trim() || !newFieldId.trim()) return;
    const field = newCustomField(newFieldType, newFieldLabel.trim(), newFieldId.trim());
    setCustomOrder((current) => ({ ...current, fields: [...current.fields, field] }));
    setNewFieldLabel('');
    setNewFieldId('');
    setNewFieldIdEdited(false);
    setCustomSaved(false);
  };

  const addCustomPreset = () => {
    const preset = customPreset === 'shirt' ? tailoredShirtPreset() : brandedApronPreset();
    setCustomOrder((current) => ({
      ...current,
      fields: [...current.fields, ...preset.map((field) => uniqueField(field, current.fields))],
    }));
    setCustomPreset('');
    setCustomSaved(false);
  };

  const saveOptions = async () => {
    const issues = validateProductOptions(options);
    setOptionIssues(issues);
    if (issues.length) return;
    if (!optionsDirty) {
      toast.success('Options are already saved.');
      return;
    }
    setOptionsSaving(true);
    try {
      const savedOptions: ProductOptionGroup[] = options.map(optionGroupFromDraft);
      await validateOptionsWithDatabase(savedOptions);
      const changes: ProductOptionsWrite = { options: savedOptions };
      await updateProductOptions(productId, changes);
      const nextOptions = savedOptions.map(optionGroupToDraft);
      setOptions(nextOptions);
      setInitialOptions(nextOptions);
      setOptionsSaved(true);
      toast.success('Options saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Options could not be saved.';
      toast.error(message);
      setOptionIssues([{ path: 'groups', message }]);
    } finally {
      setOptionsSaving(false);
    }
  };

  const saveCustomOrder = async () => {
    const issues = validateCustomRequest(customOrder);
    setCustomIssues(issues);
    if (issues.length) return;
    if (!customDirty) {
      toast.success('Custom-order settings are already saved.');
      return;
    }
    setCustomSaving(true);
    try {
      const savedFields: CustomRequestField[] = customOrder.fields.map(customFieldFromDraft);
      await validateCustomFieldsWithDatabase(savedFields);
      const changes: CustomOrderWrite = {
        custom_request_enabled: customOrder.enabled,
        custom_request_button_label: customOrder.button_label.trim(),
        custom_request_flow: customOrder.flow,
        custom_request_fee_ngn: Number(customOrder.fee_ngn),
        custom_request_notice: customOrder.notice.trim() || null,
        needed_by_mode: customOrder.needed_by_mode,
        custom_request_fields: savedFields,
      };
      await updateProductCustomOrder(productId, changes);
      const nextOrder = { ...customOrder, fields: savedFields.map(customFieldToDraft) };
      setCustomOrder(nextOrder);
      setInitialCustomOrder(nextOrder);
      setCustomSaved(true);
      toast.success('Custom-order settings saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Custom-order settings could not be saved.';
      toast.error(message);
      setCustomIssues([{ path: 'fields', message }]);
    } finally {
      setCustomSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading product options and custom-order settings…" />;
  if (loadError) {
    return <AdminCard className="admin-product-section"><h2>Product settings could not be loaded</h2><p className="admin-alert" role="alert">{loadError}</p></AdminCard>;
  }

  return (
    <>
      <AdminCard className="admin-product-section admin-config-section">
        <div className="admin-card-heading">
          <div>
            <h2>Options</h2>
            <p>Standard options affect the product’s checkout price.</p>
          </div>
        </div>
        <div className="admin-config-summary" aria-label="Currently saved options">
          <strong>Current saved options</strong>
          {initialOptions.length === 0
            ? <span>None</span>
            : initialOptions.map((group) => (
              <span className="admin-config-chip" key={group.id}>
                {group.label} · {group.type === 'choice' ? `${group.values.length} choices` : `${group.min}–${group.max} ${group.unit}`}
              </span>
            ))}
        </div>

        <div className="admin-config-add">
          <h3>Add an option group</h3>
          <div className="admin-form-grid">
            <AdminInput
              id="new-option-label"
              label="Group label"
              value={newGroupLabel}
              onChange={(label) => {
                setNewGroupLabel(label);
                if (!newGroupIdEdited) setNewGroupId(createUniqueConfigId(label, options.map((group) => group.id), 'option'));
              }}
            />
            <AdminInput
              id="new-option-id"
              label="Group ID"
              hint="Lowercase letters, numbers, and hyphens; unique within this product."
              value={newGroupId}
              onChange={(value) => {
                setNewGroupId(value.toLowerCase());
                setNewGroupIdEdited(true);
              }}
            />
            <AdminSelect
              id="new-option-type"
              label="Type"
              value={newGroupType}
              onChange={(value) => setNewGroupType(value as GroupType)}
              options={[{ value: 'choice', label: 'Choices' }, { value: 'range', label: 'Range' }]}
            />
            <AdminToggle
              id="new-option-required"
              label="Required"
              checked={newGroupRequired}
              onChange={setNewGroupRequired}
            />
          </div>
          <AdminButton type="button" disabled={!newGroupLabel.trim() || !newGroupId.trim() || options.length >= 12} onClick={addGroup}>
            Add group
          </AdminButton>
        </div>

        <div className="admin-config-presets">
          <AdminSelect
            id="option-preset"
            label="Preset"
            value={optionPreset}
            onChange={setOptionPreset}
            options={[
              { value: '', label: 'Choose an option preset' },
              { value: 'sizes', label: 'Shoe sizes 35 to 45' },
              { value: 'fabric', label: 'Fabric yardage' },
            ]}
          />
          <AdminButton type="button" variant="secondary" disabled={!optionPreset || options.length >= 12} onClick={addOptionPreset}>
            Add preset
          </AdminButton>
        </div>

        {optionIssues.length > 0 && (
          <div className="admin-config-errors" role="alert">
            {optionIssues.map((issue, index) => <p key={`${issue.path}-${index}`}>{issue.message}</p>)}
          </div>
        )}
        {options.length === 0
          ? <p className="admin-inline-note">No option groups yet.</p>
          : <div className="admin-config-list">
            {options.map((group, groupIndex) => (
              <details className="admin-config-item" key={`${group.id}-${groupIndex}`}>
                <summary>{groupLabel(group)} <span className="admin-config-item-id">({group.id})</span></summary>
                <div className="admin-config-item-body">
                  <div className="admin-form-grid">
                    <AdminInput
                      id={`option-${groupIndex}-label`}
                      label="Label"
                      value={group.label}
                      error={issueFor(optionIssues, `groups.${groupIndex}.label`)}
                      onChange={(label) => updateOptionGroup(groupIndex, (current) => ({ ...current, label }))}
                    />
                    <AdminInput id={`option-${groupIndex}-id`} label="ID (set when created)" value={group.id} onChange={() => undefined} readOnly />
                    <AdminSelect
                      id={`option-${groupIndex}-type`}
                      label="Type"
                      value={group.type}
                      onChange={(type) => updateOptionGroup(groupIndex, (current) => changeGroupType(current, type as GroupType))}
                      options={[{ value: 'choice', label: 'Choices' }, { value: 'range', label: 'Range' }]}
                    />
                    <AdminToggle
                      id={`option-${groupIndex}-required`}
                      label="Required"
                      checked={group.required}
                      onChange={(required) => updateOptionGroup(groupIndex, (current) => ({ ...current, required }))}
                    />
                  </div>
                  {group.type === 'choice'
                    ? <ChoiceGroupEditor
                      group={group}
                      groupIndex={groupIndex}
                      issues={optionIssues}
                      onChange={(next) => updateOptionGroup(groupIndex, () => next)}
                    />
                    : <div className="admin-form-grid">
                      <AdminNumberInput id={`option-${groupIndex}-min`} label="Minimum" value={group.min} onChange={(min) => updateOptionGroup(groupIndex, (current) => current.type === 'range' ? { ...current, min } : current)} error={issueFor(optionIssues, `groups.${groupIndex}.min`)} step="any" />
                      <AdminNumberInput id={`option-${groupIndex}-max`} label="Maximum" value={group.max} onChange={(max) => updateOptionGroup(groupIndex, (current) => current.type === 'range' ? { ...current, max } : current)} error={issueFor(optionIssues, `groups.${groupIndex}.max`)} step="any" />
                      <AdminNumberInput id={`option-${groupIndex}-step`} label="Step" value={group.step} onChange={(step) => updateOptionGroup(groupIndex, (current) => current.type === 'range' ? { ...current, step } : current)} error={issueFor(optionIssues, `groups.${groupIndex}.step`)} step="any" />
                      <AdminInput id={`option-${groupIndex}-unit`} label="Unit" value={group.unit} onChange={(unit) => updateOptionGroup(groupIndex, (current) => current.type === 'range' ? { ...current, unit } : current)} error={issueFor(optionIssues, `groups.${groupIndex}.unit`)} />
                      <AdminNairaInput id={`option-${groupIndex}-price`} label="Price per unit (optional)" value={group.price_per_unit} onChange={(price_per_unit) => updateOptionGroup(groupIndex, (current) => current.type === 'range' ? { ...current, price_per_unit } : current)} error={issueFor(optionIssues, `groups.${groupIndex}.price_per_unit`)} hint="Added for each selected unit." />
                    </div>}
                  <div className="admin-form-actions">
                    {moveButton('Move up', groupIndex === 0, () => {
                      setOptions((current) => reorder(current, groupIndex, groupIndex - 1));
                      setOptionsSaved(false);
                    })}
                    {moveButton('Move down', groupIndex === options.length - 1, () => {
                      setOptions((current) => reorder(current, groupIndex, groupIndex + 1));
                      setOptionsSaved(false);
                    })}
                    <AdminButton type="button" variant="danger" onClick={() => {
                      setOptions((current) => current.filter((_, index) => index !== groupIndex));
                      setOptionsSaved(false);
                    }}>Remove group</AdminButton>
                  </div>
                </div>
              </details>
            ))}
          </div>}
        <div className="admin-form-actions">
          <AdminButton type="button" disabled={optionsSaving} onClick={() => void saveOptions()}>
            {optionsSaving ? 'Saving…' : 'Save options'}
          </AdminButton>
          {optionsDirty && <span className="admin-inline-note">Unsaved options</span>}
          {optionsSaved && <span className="admin-config-saved" role="status">Saved</span>}
        </div>
      </AdminCard>

      <AdminCard className="admin-product-section admin-config-section">
        <div className="admin-card-heading">
          <div>
            <h2>Custom orders</h2>
            <p>Configure custom-order requests and their customer form.</p>
          </div>
        </div>
        {customIssues.length > 0 && (
          <div className="admin-config-errors" role="alert">
            {customIssues.map((issue, index) => <p key={`${issue.path}-${index}`}>{issue.message}</p>)}
          </div>
        )}
        <div className="admin-form-grid">
          <AdminToggle
            id="custom-enabled"
            label="Accept custom-order requests"
            checked={customOrder.enabled}
            onChange={(enabled) => {
              setCustomOrder((current) => ({ ...current, enabled }));
              setCustomSaved(false);
            }}
          />
          <AdminInput
            id="custom-button-label"
            label="Button label"
            value={customOrder.button_label}
            error={issueFor(customIssues, 'button_label')}
            onChange={(button_label) => {
              setCustomOrder((current) => ({ ...current, button_label }));
              setCustomSaved(false);
            }}
          />
          <AdminSelect
            id="custom-flow"
            label="Request flow"
            value={customOrder.flow}
            onChange={(flow) => {
              setCustomOrder((current) => ({ ...current, flow: flow as CustomOrderDraft['flow'] }));
              setCustomSaved(false);
            }}
            options={[
              { value: 'whatsapp_quote', label: 'WhatsApp quote' },
              { value: 'checkout', label: 'Checkout' },
            ]}
          />
          <AdminNairaInput
            id="custom-fee"
            label="Custom-order fee"
            value={customOrder.fee_ngn}
            error={issueFor(customIssues, 'fee_ngn')}
            onChange={(fee_ngn) => {
              setCustomOrder((current) => ({ ...current, fee_ngn }));
              setCustomSaved(false);
            }}
            hint="Added to the price only for the checkout flow."
          />
          <AdminSelect
            id="needed-by-mode"
            label="Needed-by date"
            value={customOrder.needed_by_mode}
            onChange={(needed_by_mode) => {
              setCustomOrder((current) => ({ ...current, needed_by_mode: needed_by_mode as CustomOrderDraft['needed_by_mode'] }));
              setCustomSaved(false);
            }}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'optional', label: 'Optional' },
              { value: 'required', label: 'Required' },
            ]}
          />
          <AdminTextarea
            id="custom-notice"
            label="Notice (optional)"
            value={customOrder.notice}
            onChange={(notice) => {
              setCustomOrder((current) => ({ ...current, notice }));
              setCustomSaved(false);
            }}
          />
        </div>

        <div className="admin-config-add">
          <h3>Add a custom field</h3>
          <div className="admin-form-grid">
            <AdminInput
              id="new-custom-field-label"
              label="Field label"
              value={newFieldLabel}
              onChange={(label) => {
                setNewFieldLabel(label);
                if (!newFieldIdEdited) setNewFieldId(createUniqueConfigId(label, customOrder.fields.map((field) => field.id), 'field'));
              }}
            />
            <AdminInput
              id="new-custom-field-id"
              label="Field ID"
              value={newFieldId}
              onChange={(value) => {
                setNewFieldId(value.toLowerCase());
                setNewFieldIdEdited(true);
              }}
              hint="Lowercase letters, numbers, and hyphens; unique within this product."
            />
            <AdminSelect
              id="new-custom-field-type"
              label="Field type"
              value={newFieldType}
              onChange={(value) => setNewFieldType(value as FieldType)}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'textarea', label: 'Textarea' },
                { value: 'number', label: 'Number' },
                { value: 'measurement', label: 'Measurement (cm or in)' },
                { value: 'choice', label: 'Choice' },
              ]}
            />
          </div>
          <AdminButton type="button" disabled={!newFieldLabel.trim() || !newFieldId.trim() || customOrder.fields.length >= 15} onClick={addCustomField}>
            Add field
          </AdminButton>
        </div>

        <div className="admin-config-presets">
          <AdminSelect
            id="custom-preset"
            label="Preset"
            value={customPreset}
            onChange={setCustomPreset}
            options={[
              { value: '', label: 'Choose a custom-order preset' },
              { value: 'shirt', label: 'Tailored shirt measurements' },
              { value: 'apron', label: 'Branded apron' },
            ]}
          />
          <AdminButton type="button" variant="secondary" disabled={!customPreset || customOrder.fields.length >= 15} onClick={addCustomPreset}>
            Add preset
          </AdminButton>
        </div>

        {customOrder.enabled && customOrder.fields.length === 0 && (
          <p className="admin-field-error" role="alert">Add at least one custom field before saving while custom orders are enabled.</p>
        )}
        {customOrder.fields.length === 0
          ? <p className="admin-inline-note">No custom fields yet.</p>
          : <div className="admin-config-list">
            {customOrder.fields.map((field, fieldIndex) => (
              <details className="admin-config-item" key={`${field.id}-${fieldIndex}`}>
                <summary>{field.label || 'Untitled field'} · {field.type} <span className="admin-config-item-id">({field.id})</span></summary>
                <div className="admin-config-item-body">
                  <div className="admin-form-grid">
                    <AdminInput id={`custom-${fieldIndex}-label`} label="Label" value={field.label} error={issueFor(customIssues, `fields.${fieldIndex}.label`)} onChange={(label) => updateCustomField(fieldIndex, (current) => ({ ...current, label }))} />
                    <AdminInput id={`custom-${fieldIndex}-id`} label="ID (set when created)" value={field.id} onChange={() => undefined} readOnly />
                    <AdminSelect
                      id={`custom-${fieldIndex}-type`}
                      label="Field type"
                      value={field.type}
                      onChange={(type) => updateCustomField(fieldIndex, (current) => changeFieldType(current, type as FieldType))}
                      options={[
                        { value: 'text', label: 'Text' },
                        { value: 'textarea', label: 'Textarea' },
                        { value: 'number', label: 'Number' },
                        { value: 'measurement', label: 'Measurement (cm or in)' },
                        { value: 'choice', label: 'Choice' },
                      ]}
                    />
                    <AdminToggle id={`custom-${fieldIndex}-required`} label="Required" checked={field.required} onChange={(required) => updateCustomField(fieldIndex, (current) => ({ ...current, required }))} />
                    <AdminTextarea id={`custom-${fieldIndex}-help`} label="Help text (optional)" value={field.help_text} onChange={(help_text) => updateCustomField(fieldIndex, (current) => ({ ...current, help_text }))} />
                    {field.type === 'text' || field.type === 'textarea'
                      ? <>
                        <AdminNumberInput id={`custom-${fieldIndex}-max-length`} label="Maximum length" value={field.max_length} onChange={(max_length) => updateCustomField(fieldIndex, (current) => current.type === 'text' || current.type === 'textarea' ? { ...current, max_length } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.max_length`)} min={1} max={2000} />
                        <AdminInput id={`custom-${fieldIndex}-placeholder`} label="Placeholder" value={field.placeholder} onChange={(placeholder) => updateCustomField(fieldIndex, (current) => current.type === 'text' || current.type === 'textarea' ? { ...current, placeholder } : current)} />
                      </>
                      : field.type === 'number'
                        ? <>
                          <AdminNumberInput id={`custom-${fieldIndex}-min`} label="Minimum" value={field.min} onChange={(min) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, min } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.min`)} step="any" />
                          <AdminNumberInput id={`custom-${fieldIndex}-max`} label="Maximum" value={field.max} onChange={(max) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, max } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.max`)} step="any" />
                          <AdminNumberInput id={`custom-${fieldIndex}-step`} label="Step" value={field.step} onChange={(step) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, step } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.step`)} step="any" />
                          <AdminInput id={`custom-${fieldIndex}-unit`} label="Unit" value={field.unit} onChange={(unit) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, unit } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.unit`)} />
                        </>
                        : field.type === 'measurement'
                          ? <>
                            <AdminNumberInput id={`custom-${fieldIndex}-min`} label="Minimum" value={field.min} onChange={(min) => updateCustomField(fieldIndex, (current) => current.type === 'measurement' ? { ...current, min } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.min`)} step="any" />
                            <AdminNumberInput id={`custom-${fieldIndex}-max`} label="Maximum" value={field.max} onChange={(max) => updateCustomField(fieldIndex, (current) => current.type === 'measurement' ? { ...current, max } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.max`)} step="any" />
                            <AdminSelect id={`custom-${fieldIndex}-unit`} label="Unit" value={field.unit} onChange={(unit) => updateCustomField(fieldIndex, (current) => current.type === 'measurement' ? { ...current, unit: unit as 'cm' | 'in' } : current)} error={issueFor(customIssues, `fields.${fieldIndex}.unit`)} options={[{ value: 'cm', label: 'Centimetres (cm)' }, { value: 'in', label: 'Inches (in)' }]} />
                          </>
                          : <ChoiceFieldEditor
                            field={field}
                            fieldIndex={fieldIndex}
                            issues={customIssues}
                            onChange={(next) => updateCustomField(fieldIndex, () => next)}
                          />}
                  </div>
                  <div className="admin-form-actions">
                    {moveButton('Move up', fieldIndex === 0, () => {
                      setCustomOrder((current) => ({ ...current, fields: reorder(current.fields, fieldIndex, fieldIndex - 1) }));
                      setCustomSaved(false);
                    })}
                    {moveButton('Move down', fieldIndex === customOrder.fields.length - 1, () => {
                      setCustomOrder((current) => ({ ...current, fields: reorder(current.fields, fieldIndex, fieldIndex + 1) }));
                      setCustomSaved(false);
                    })}
                    <AdminButton type="button" variant="danger" onClick={() => {
                      setCustomOrder((current) => ({ ...current, fields: current.fields.filter((_, index) => index !== fieldIndex) }));
                      setCustomSaved(false);
                    }}>Remove field</AdminButton>
                  </div>
                </div>
              </details>
            ))}
          </div>}
        <div className="admin-form-actions">
          <AdminButton type="button" disabled={customSaving} onClick={() => void saveCustomOrder()}>
            {customSaving ? 'Saving…' : 'Save custom orders'}
          </AdminButton>
          {customDirty && <span className="admin-inline-note">Unsaved custom-order settings</span>}
          {customSaved && <span className="admin-config-saved" role="status">Saved</span>}
        </div>
      </AdminCard>
    </>
  );
}

function ChoiceGroupEditor({
  group,
  groupIndex,
  issues,
  onChange,
}: {
  group: Extract<OptionGroupDraft, { type: 'choice' }>;
  groupIndex: number;
  issues: ProductConfigIssue[];
  onChange: (group: Extract<OptionGroupDraft, { type: 'choice' }>) => void;
}) {
  const [startNumber, setStartNumber] = useState('35');
  const [endNumber, setEndNumber] = useState('45');
  const [quickAddError, setQuickAddError] = useState('');
  return (
    <div className="admin-config-sublist">
      <AdminToggle
        id={`option-${groupIndex}-multiple`}
        label="Allow multiple choices"
        checked={group.multiple}
        onChange={(multiple) => onChange({ ...group, multiple })}
      />
      {group.values.map((value, valueIndex) => (
        <div className="admin-config-value" key={`${value.value}-${valueIndex}`}>
          <div className="admin-form-grid">
            <AdminInput id={`option-${groupIndex}-value-${valueIndex}-label`} label="Choice label" value={value.label} error={issueFor(issues, `groups.${groupIndex}.values.${valueIndex}.label`)} onChange={(label) => onChange({ ...group, values: group.values.map((item, index) => index === valueIndex ? { ...item, label } : item) })} />
            <AdminInput id={`option-${groupIndex}-value-${valueIndex}-stored`} label="Stored value" value={value.value} error={issueFor(issues, `groups.${groupIndex}.values.${valueIndex}.value`)} onChange={(storedValue) => onChange({ ...group, values: group.values.map((item, index) => index === valueIndex ? { ...item, value: storedValue } : item) })} />
            <AdminNairaInput id={`option-${groupIndex}-value-${valueIndex}-price`} label="Extra price" value={value.price_delta} error={issueFor(issues, `groups.${groupIndex}.values.${valueIndex}.price_delta`)} onChange={(price_delta) => onChange({ ...group, values: group.values.map((item, index) => index === valueIndex ? { ...item, price_delta } : item) })} />
            <AdminInput id={`option-${groupIndex}-value-${valueIndex}-swatch`} label="Colour swatch (optional)" value={value.swatch} error={issueFor(issues, `groups.${groupIndex}.values.${valueIndex}.swatch`)} hint="Hex colour such as #AABBCC." onChange={(swatch) => onChange({ ...group, values: group.values.map((item, index) => index === valueIndex ? { ...item, swatch } : item) })} />
            <AdminToggle id={`option-${groupIndex}-value-${valueIndex}-available`} label="Available" checked={value.available} onChange={(available) => onChange({ ...group, values: group.values.map((item, index) => index === valueIndex ? { ...item, available } : item) })} />
          </div>
          <div className="admin-form-actions">
            {moveButton('Move up', valueIndex === 0, () => onChange({ ...group, values: reorder(group.values, valueIndex, valueIndex - 1) }))}
            {moveButton('Move down', valueIndex === group.values.length - 1, () => onChange({ ...group, values: reorder(group.values, valueIndex, valueIndex + 1) }))}
            <AdminButton type="button" variant="danger" disabled={group.values.length <= 1} onClick={() => onChange({ ...group, values: group.values.filter((_, index) => index !== valueIndex) })}>Remove value</AdminButton>
          </div>
        </div>
      ))}
      <div className="admin-form-actions">
        <AdminButton type="button" variant="secondary" disabled={group.values.length >= 60} onClick={() => onChange({ ...group, values: [...group.values, emptyChoiceValue()] })}>Add value</AdminButton>
      </div>
      <div className="admin-config-quick-add">
        <strong>Quick add numbers</strong>
        <div className="admin-config-quick-add-fields">
          <AdminNumberInput id={`option-${groupIndex}-quick-start`} label="From" value={startNumber} onChange={setStartNumber} inputMode="numeric" />
          <AdminNumberInput id={`option-${groupIndex}-quick-end`} label="To" value={endNumber} onChange={setEndNumber} inputMode="numeric" />
          <AdminButton
            type="button"
            variant="secondary"
            disabled={group.values.length >= 60}
            onClick={() => {
              try {
                const added = quickAddNumbers(Number(startNumber), Number(endNumber));
                const existing = new Set(group.values.map((item) => item.value));
                const duplicates = added.filter((item) => existing.has(item.value));
                if (duplicates.length || group.values.length + added.length > 60) {
                  setQuickAddError(duplicates.length ? `These stored values already exist: ${duplicates.map((item) => item.value).join(', ')}.` : 'A choice group can contain at most 60 values.');
                  return;
                }
                onChange({ ...group, values: [...group.values, ...added] });
                setQuickAddError('');
              } catch (error) {
                setQuickAddError(error instanceof Error ? error.message : 'Enter a valid whole-number range.');
              }
            }}
          >
            Add numbers
          </AdminButton>
        </div>
        {quickAddError && <p className="admin-field-error" role="alert">{quickAddError}</p>}
      </div>
    </div>
  );
}

function ChoiceFieldEditor({
  field,
  fieldIndex,
  issues,
  onChange,
}: {
  field: Extract<CustomFieldDraft, { type: 'choice' }>;
  fieldIndex: number;
  issues: ProductConfigIssue[];
  onChange: (field: Extract<CustomFieldDraft, { type: 'choice' }>) => void;
}) {
  return (
    <div className="admin-config-sublist">
      {field.values.map((value, valueIndex) => (
        <div className="admin-config-quick-add-fields" key={`${value}-${valueIndex}`}>
          <AdminInput
            id={`custom-${fieldIndex}-choice-${valueIndex}`}
            label={`Choice ${valueIndex + 1}`}
            value={value}
            error={issueFor(issues, `fields.${fieldIndex}.values.${valueIndex}`)}
            onChange={(nextValue) => onChange({ ...field, values: field.values.map((item, index) => index === valueIndex ? nextValue : item) })}
          />
          <AdminButton type="button" variant="danger" disabled={field.values.length <= 1} onClick={() => onChange({ ...field, values: field.values.filter((_, index) => index !== valueIndex) })}>Remove</AdminButton>
        </div>
      ))}
      <AdminButton type="button" variant="secondary" disabled={field.values.length >= 30} onClick={() => onChange({ ...field, values: [...field.values, ''] })}>Add choice</AdminButton>
    </div>
  );
}

export function productOptionsToDraft(groups: ProductOptionGroup[]): OptionGroupDraft[] {
  return optionsRoundTrip(groups).map(optionGroupToDraft);
}

export function customFieldsToDraft(fields: CustomRequestField[]): CustomFieldDraft[] {
  return fieldsRoundTrip(fields).map(customFieldToDraft);
}
