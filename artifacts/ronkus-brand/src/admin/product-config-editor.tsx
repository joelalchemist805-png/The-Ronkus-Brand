import { useRef, useState } from 'react';
import type { CustomRequestField, ProductOptionGroup } from '@/lib/db-types';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminNairaInput,
  AdminNumberInput,
  AdminSelect,
  AdminTextarea,
  AdminToggle,
} from './admin-components';
import {
  brandedApronPreset,
  createUniqueConfigId,
  customFieldToDraft,
  fabricYardagePreset,
  optionGroupToDraft,
  quickAddNumbers,
  reorder,
  shoeSizesPreset,
  tailoredShirtPreset,
  type CustomFieldDraft,
  type CustomOrderDraft,
  type OptionGroupDraft,
  type OptionValueDraft,
} from './product-config';
import { colourPresetToValue, colourPresets } from './product-workflow';

type Props = {
  section: 'options' | 'custom';
  options: OptionGroupDraft[];
  customOrder: CustomOrderDraft;
  onOptionsChange: (options: OptionGroupDraft[]) => void;
  onCustomOrderChange: (customOrder: CustomOrderDraft) => void;
};

const fieldTypes: { value: CustomFieldDraft['type']; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Long answer' },
  { value: 'number', label: 'Number' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'choice', label: 'Pick from a list' },
];

function blankValue(): OptionValueDraft {
  return { value: '', label: '', price_delta: '0', swatch: '', available: true };
}

function uniqueGroup(group: OptionGroupDraft, options: OptionGroupDraft[], fields: CustomFieldDraft[]): OptionGroupDraft {
  return {
    ...group,
    id: createUniqueConfigId(group.label, [...options.map(({ id }) => id), ...fields.map(({ id }) => id)], 'option'),
  };
}

function uniqueFields(fields: CustomFieldDraft[], options: OptionGroupDraft[], current: CustomFieldDraft[]): CustomFieldDraft[] {
  const used = [...options.map(({ id }) => id), ...current.map(({ id }) => id)];
  return fields.map((field) => {
    const id = createUniqueConfigId(field.label, used, 'field');
    used.push(id);
    return { ...field, id };
  });
}

function createField(type: CustomFieldDraft['type'], label: string, id: string): CustomFieldDraft {
  const common = { id, label, required: false, help_text: '' };
  if (type === 'text' || type === 'textarea') return { ...common, type, max_length: '200', placeholder: '' };
  if (type === 'number') return { ...common, type, min: '0', max: '100', step: '1', unit: '' };
  if (type === 'measurement') return { ...common, type, min: '0', max: '200', unit: 'cm' };
  return { ...common, type, values: ['Option 1'] };
}

function Hint({ children }: { children: string }) {
  return <p className="admin-field-hint">{children}</p>;
}

export function ProductConfigEditor({
  section,
  options,
  customOrder,
  onOptionsChange,
  onCustomOrderChange,
}: Props) {
  const [sizeFrom, setSizeFrom] = useState('35');
  const [sizeTo, setSizeTo] = useState('45');
  const [ownListLabel, setOwnListLabel] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<CustomFieldDraft['type']>('text');
  const [presetNotice, setPresetNotice] = useState('');
  const questionListRef = useRef<HTMLDivElement>(null);

  const addGroup = (group: OptionGroupDraft): boolean => {
    if (options.length >= 12) {
      setPresetNotice('A product can have up to 12 choice groups.');
      return false;
    }
    onOptionsChange([...options, uniqueGroup(group, options, customOrder.fields)]);
    return true;
  };

  const addSizes = () => {
    const from = Number(sizeFrom);
    const to = Number(sizeTo);
    try {
      const preset = shoeSizesPreset();
      if (preset.type !== 'choice') return;
      addGroup({ ...preset, values: quickAddNumbers(from, to) });
      setPresetNotice('');
    } catch (error) {
      setPresetNotice(error instanceof Error ? error.message : 'Enter a valid size range.');
    }
  };

  const addColour = (colour: (typeof colourPresets)[number]) => {
    let group = options.find((item) => item.type === 'choice' && (
      ['colour', 'colours', 'color', 'colors'].includes(item.id)
      || ['colour', 'colours', 'color', 'colors'].includes(item.label.trim().toLowerCase())
    ));
    let isNew = false;
    if (!group) {
      if (options.length >= 12) {
        setPresetNotice('A product can have up to 12 choice groups.');
        return;
      }
      group = uniqueGroup({
        id: 'colours',
        label: 'Colours',
        type: 'choice',
        required: true,
        multiple: false,
        values: [],
      }, options, customOrder.fields);
      isNew = true;
    }
    if (group.type !== 'choice') return;
    if (group.values.length >= 60) {
      setPresetNotice('A choice list can contain up to 60 values.');
      return;
    }
    if (group.values.some(({ label }) => label.toLowerCase() === colour.label.toLowerCase())) return;
    const nextGroup = { ...group, values: [...group.values, colourPresetToValue(colour, group.values)] };
    onOptionsChange(isNew
      ? [...options, nextGroup]
      : options.map((item) => item.id === group?.id ? nextGroup : item));
  };

  const updateGroup = (index: number, transform: (group: OptionGroupDraft) => OptionGroupDraft) => {
    onOptionsChange(options.map((group, itemIndex) => itemIndex === index ? transform(group) : group));
  };

  const updateCustomField = (index: number, transform: (field: CustomFieldDraft) => CustomFieldDraft) => {
    onCustomOrderChange({
      ...customOrder,
      fields: customOrder.fields.map((field, itemIndex) => itemIndex === index ? transform(field) : field),
    });
  };

  const addQuestion = () => {
    const label = newQuestion.trim();
    if (!label || customOrder.fields.length >= 15) return;
    const id = createUniqueConfigId(label, [
      ...options.map(({ id: optionId }) => optionId),
      ...customOrder.fields.map(({ id: fieldId }) => fieldId),
    ], 'question');
    const field = createField(newQuestionType, label, id);
    onCustomOrderChange({ ...customOrder, fields: [...customOrder.fields, field] });
    setNewQuestion('');
    setPresetNotice(`Added ${label}. Edit or remove it below.`);
    window.setTimeout(() => questionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const addQuestionPreset = (kind: 'shirt' | 'design') => {
    const preset = kind === 'shirt' ? tailoredShirtPreset() : brandedApronPreset();
    const added = uniqueFields(preset, options, customOrder.fields);
    if (customOrder.fields.length + added.length > 15) {
      setPresetNotice('There is not enough room for every question in this quick start.');
      return;
    }
    onCustomOrderChange({ ...customOrder, fields: [...customOrder.fields, ...added] });
    const labels = added.map(({ label }) => label);
    setPresetNotice(`Added ${labels.join(', ')}. Edit or remove them below.`);
    window.setTimeout(() => questionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  if (section === 'options') {
    return (
      <AdminCard className="admin-product-section admin-config-section">
        <div>
          <h2>Does this come in different sizes, colours or amounts?</h2>
          <Hint>Let customers choose a size, colour, or amount before they order.</Hint>
        </div>
        <h3>Quick start</h3>
        <div className="admin-config-quick-starts">
          <section className="admin-config-add">
            <h3>Shoe sizes</h3>
            <Hint>Add a range of shoe sizes customers can pick from.</Hint>
            <div className="admin-config-quick-add-fields">
              <AdminNumberInput id="shoe-size-from" label="From" value={sizeFrom} onChange={setSizeFrom} />
              <AdminNumberInput id="shoe-size-to" label="To" value={sizeTo} onChange={setSizeTo} />
              <AdminButton type="button" variant="secondary" disabled={options.length >= 12} onClick={addSizes}>Add shoe sizes</AdminButton>
            </div>
          </section>
          <section className="admin-config-add">
            <h3>Colours</h3>
            <Hint>Tap a colour to add it to the customer’s choices.</Hint>
            <div className="admin-colour-chips">
              {colourPresets.map((colour) => {
                const matchingColourCount = options.reduce((count, group) => (
                  group.type === 'choice' && (
                    ['colour', 'colours', 'color', 'colors'].includes(group.id)
                    || ['colour', 'colours', 'color', 'colors'].includes(group.label.trim().toLowerCase())
                  )
                    ? group.values.length
                    : count
                ), 0);
                const exists = options.some((group) => group.type === 'choice' && group.values.some(({ label }) => label.toLowerCase() === colour.label.toLowerCase()));
                const hasColourGroup = options.some((group) => group.type === 'choice' && (
                  ['colour', 'colours', 'color', 'colors'].includes(group.id)
                  || ['colour', 'colours', 'color', 'colors'].includes(group.label.trim().toLowerCase())
                ));
                const blocked = exists || (hasColourGroup ? matchingColourCount >= 60 : options.length >= 12);
                return (
                  <button
                    className="admin-colour-chip"
                    type="button"
                    key={colour.label}
                    disabled={blocked}
                    onClick={() => addColour(colour)}
                  >
                    <span className="admin-colour-dot" style={{ backgroundColor: colour.hex }} aria-hidden="true" />
                    {colour.label}{exists ? ' added' : ''}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="admin-config-add">
            <h3>Fabric by the yard</h3>
            <Hint>Customers choose how many yards they need.</Hint>
            <AdminButton type="button" variant="secondary" disabled={options.length >= 12} onClick={() => addGroup(fabricYardagePreset())}>Add fabric by the yard</AdminButton>
          </section>
          <section className="admin-config-add">
            <h3>Make my own list</h3>
            <Hint>For example, sizes, colours, or styles.</Hint>
            <AdminInput id="own-list-label" label="What should customers choose?" value={ownListLabel} onChange={setOwnListLabel} />
            <AdminButton
              type="button"
              variant="secondary"
              disabled={!ownListLabel.trim() || options.length >= 12}
              onClick={() => {
                const label = ownListLabel.trim();
                addGroup({ id: label, label, type: 'choice', required: false, multiple: false, values: [blankValue()] });
                setOwnListLabel('');
              }}
            >Add my list</AdminButton>
          </section>
        </div>
        {presetNotice && <p className="admin-inline-note" role="status">{presetNotice}</p>}
        {options.length === 0
          ? <p className="admin-inline-note">No choices added.</p>
          : <div className="admin-config-list">
            {options.map((group, groupIndex) => (
              <details className="admin-config-item" key={`${group.id}-${groupIndex}`}>
                <summary>{group.label || 'Untitled choice'}</summary>
                <div className="admin-config-item-body">
                  <div className="admin-form-grid">
                    <AdminInput
                      id={`option-${groupIndex}-label`}
                      label="What is this choice called?"
                      value={group.label}
                      onChange={(label) => updateGroup(groupIndex, (current) => ({ ...current, label }))}
                    />
                    <AdminSelect
                      id={`option-${groupIndex}-type`}
                      label="How do customers choose?"
                      hint="Pick a list of choices or let customers enter an amount."
                      value={group.type}
                      onChange={(type) => updateGroup(groupIndex, (current) => type === 'choice'
                        ? { id: current.id, label: current.label, required: current.required, type, multiple: false, values: [blankValue()] }
                        : { id: current.id, label: current.label, required: current.required, type: 'range', min: '1', max: '10', step: '1', unit: 'yard', price_per_unit: '' })}
                      options={[
                        { value: 'choice', label: 'Pick from a list (sizes, colours)' },
                        { value: 'range', label: 'Pick an amount (like yards)' },
                      ]}
                    />
                    <AdminToggle
                      id={`option-${groupIndex}-required`}
                      label="Customers must choose"
                      checked={group.required}
                      onChange={(required) => updateGroup(groupIndex, (current) => ({ ...current, required }))}
                    />
                  </div>
                  <Hint>Turn this off when customers can leave this choice blank.</Hint>
                  {group.type === 'choice'
                    ? <div className="admin-config-sublist">
                      <Hint>Customers will see these names. Their saved choices stay linked to existing orders if you rename them.</Hint>
                      <AdminToggle
                        id={`option-${groupIndex}-multiple`}
                        label="Let customers pick more than one"
                        checked={group.multiple}
                        onChange={(multiple) => updateGroup(groupIndex, (current) => current.type === 'choice' ? { ...current, multiple } : current)}
                      />
                      <Hint>Turn this on when more than one answer is allowed.</Hint>
                      {group.values.map((value, valueIndex) => (
                        <div className="admin-config-value" key={`${value.value}-${valueIndex}`}>
                          <div className="admin-form-grid">
                            <AdminInput
                              id={`option-${groupIndex}-value-${valueIndex}-label`}
                              label="Choice customers will see"
                              value={value.label}
                              onChange={(label) => updateGroup(groupIndex, (current) => current.type === 'choice'
                                ? { ...current, values: current.values.map((item, index) => index === valueIndex
                                  ? {
                                    ...item,
                                    label,
                                    value: item.value || createUniqueConfigId(
                                      label,
                                      options.flatMap((option) => option.type === 'choice' ? option.values.map(({ value: stored }) => stored) : []),
                                      'choice',
                                    ),
                                  }
                                  : item) }
                                : current)}
                            />
                            <AdminNairaInput
                              id={`option-${groupIndex}-value-${valueIndex}-price`}
                              label="Extra cost (naira)"
                              value={value.price_delta}
                              onChange={(price_delta) => updateGroup(groupIndex, (current) => current.type === 'choice'
                                ? { ...current, values: current.values.map((item, index) => index === valueIndex ? { ...item, price_delta } : item) }
                                : current)}
                              hint="Add an extra cost for this choice, or leave 0."
                            />
                            <div className="admin-colour-inputs">
                              <AdminInput
                                id={`option-${groupIndex}-value-${valueIndex}-swatch`}
                                label="Colour dot (optional)"
                                value={value.swatch}
                                onChange={(swatch) => updateGroup(groupIndex, (current) => current.type === 'choice'
                                  ? { ...current, values: current.values.map((item, index) => index === valueIndex ? { ...item, swatch } : item) }
                                  : current)}
                                hint="Enter a six-digit hex colour, such as #AABBCC."
                                placeholder="#AABBCC"
                              />
                              <label className="admin-field">
                                <span>Pick a colour</span>
                                <input
                                  aria-label="Pick a colour"
                                  type="color"
                                  value={/^#[0-9A-Fa-f]{6}$/.test(value.swatch) ? value.swatch : '#000000'}
                                  onChange={(event) => updateGroup(groupIndex, (current) => current.type === 'choice'
                                    ? { ...current, values: current.values.map((item, index) => index === valueIndex ? { ...item, swatch: event.target.value.toUpperCase() } : item) }
                                    : current)}
                                />
                              </label>
                            </div>
                            <AdminToggle
                              id={`option-${groupIndex}-value-${valueIndex}-available`}
                              label="In stock"
                              checked={value.available}
                              onChange={(available) => updateGroup(groupIndex, (current) => current.type === 'choice'
                                ? { ...current, values: current.values.map((item, index) => index === valueIndex ? { ...item, available } : item) }
                                : current)}
                            />
                            <Hint>Unavailable choices will not be offered to customers.</Hint>
                          </div>
                          <AdminButton
                            type="button"
                            variant="danger"
                            disabled={group.values.length <= 1}
                            onClick={() => updateGroup(groupIndex, (current) => current.type === 'choice'
                              ? { ...current, values: current.values.filter((_, index) => index !== valueIndex) }
                              : current)}
                          >Remove choice</AdminButton>
                        </div>
                      ))}
                      <AdminButton
                        type="button"
                        variant="secondary"
                        disabled={group.values.length >= 60}
                        onClick={() => updateGroup(groupIndex, (current) => current.type === 'choice'
                          ? { ...current, values: [...current.values, blankValue()] }
                          : current)}
                      >Add another choice</AdminButton>
                    </div>
                    : <div className="admin-form-grid">
                      <AdminNumberInput id={`option-${groupIndex}-min`} label="Minimum amount" value={group.min} onChange={(min) => updateGroup(groupIndex, (current) => current.type === 'range' ? { ...current, min } : current)} step="any" />
                      <AdminNumberInput id={`option-${groupIndex}-max`} label="Maximum amount" value={group.max} onChange={(max) => updateGroup(groupIndex, (current) => current.type === 'range' ? { ...current, max } : current)} step="any" />
                      <AdminNumberInput id={`option-${groupIndex}-step`} label="Amount steps" value={group.step} onChange={(step) => updateGroup(groupIndex, (current) => current.type === 'range' ? { ...current, step } : current)} step="any" />
                      <AdminInput id={`option-${groupIndex}-unit`} label="Unit (for example yard)" value={group.unit} onChange={(unit) => updateGroup(groupIndex, (current) => current.type === 'range' ? { ...current, unit } : current)} />
                      <AdminNairaInput id={`option-${groupIndex}-price`} label="Cost per unit (naira)" value={group.price_per_unit} onChange={(price_per_unit) => updateGroup(groupIndex, (current) => current.type === 'range' ? { ...current, price_per_unit } : current)} hint="Leave empty if the amount does not change the price." />
                    </div>}
                  <div className="admin-form-actions">
                    <AdminButton type="button" variant="secondary" disabled={groupIndex === 0} onClick={() => onOptionsChange(reorder(options, groupIndex, groupIndex - 1))}>Move up</AdminButton>
                    <AdminButton type="button" variant="secondary" disabled={groupIndex === options.length - 1} onClick={() => onOptionsChange(reorder(options, groupIndex, groupIndex + 1))}>Move down</AdminButton>
                    <AdminButton type="button" variant="danger" onClick={() => onOptionsChange(options.filter((_, index) => index !== groupIndex))}>Remove choice</AdminButton>
                  </div>
                </div>
              </details>
            ))}
          </div>}
      </AdminCard>
    );
  }

  return (
    <AdminCard className="admin-product-section admin-config-section">
      <div>
        <h2>Let customers ask for a customised version of this product</h2>
        <Hint>Collect the details you need to make this item just right.</Hint>
      </div>
      <AdminToggle
        id="custom-enabled"
        label="Let customers request customisation"
        checked={customOrder.enabled}
        onChange={(enabled) => onCustomOrderChange({ ...customOrder, enabled })}
      />
      <Hint>Switch this on to collect details for a made-to-order version.</Hint>
      {customOrder.enabled && <>
        <div className="admin-form-grid">
          <AdminInput id="custom-button-label" label="Button text customers will tap" value={customOrder.button_label} onChange={(button_label) => onCustomOrderChange({ ...customOrder, button_label })} hint="For example, Customise this product." />
          <AdminSelect
            id="custom-flow"
            label="How should the request be sent?"
            hint="Choose whether you will quote first or take payment at checkout."
            value={customOrder.flow}
            onChange={(flow) => onCustomOrderChange({ ...customOrder, flow: flow as CustomOrderDraft['flow'] })}
            options={[
              { value: 'whatsapp_quote', label: 'Send me a WhatsApp message (I will quote a price)' },
              { value: 'checkout', label: 'Pay at checkout (add the extra charge)' },
            ]}
          />
          <AdminNairaInput id="custom-fee" label="Extra charge for customising (naira)" value={customOrder.fee_ngn} onChange={(fee_ngn) => onCustomOrderChange({ ...customOrder, fee_ngn })} hint="Added at checkout when customers choose that request flow." />
          <AdminSelect
            id="needed-by-mode"
            label="Ask when they need it"
            hint="Choose whether the date is not asked, optional, or required."
            value={customOrder.needed_by_mode}
            onChange={(needed_by_mode) => onCustomOrderChange({ ...customOrder, needed_by_mode: needed_by_mode as CustomOrderDraft['needed_by_mode'] })}
            options={[{ value: 'off', label: 'No' }, { value: 'optional', label: 'Optional' }, { value: 'required', label: 'Required' }]}
          />
          <AdminTextarea id="custom-notice" label="Message shown to customers" value={customOrder.notice} onChange={(notice) => onCustomOrderChange({ ...customOrder, notice })} hint="For example, tell customers how long a custom item usually takes." />
        </div>

        <div className="admin-config-add">
          <h3>Add a question for customers</h3>
          <Hint>Ask for a measurement, a note, or a choice that helps you customise the product.</Hint>
          <AdminInput id="new-custom-question" label="Question" value={newQuestion} onChange={setNewQuestion} hint="Write the question customers will answer." />
          <AdminSelect id="new-custom-answer-type" label="Answer type" value={newQuestionType} onChange={(type) => setNewQuestionType(type as CustomFieldDraft['type'])} options={fieldTypes} hint="Choose the kind of answer you expect." />
          <AdminButton type="button" disabled={!newQuestion.trim() || customOrder.fields.length >= 15} onClick={addQuestion}>Add a question</AdminButton>
        </div>

        <div className="admin-config-add">
          <h3>Quick start</h3>
          <Hint>Shirt measurements adds Bust, Waist, and Sleeve length. Design or branding adds a design description and request type.</Hint>
          <div className="admin-form-actions">
            <AdminButton type="button" variant="secondary" disabled={customOrder.fields.length + 3 > 15} onClick={() => addQuestionPreset('shirt')}>Shirt measurements</AdminButton>
            <AdminButton type="button" variant="secondary" disabled={customOrder.fields.length + 2 > 15} onClick={() => addQuestionPreset('design')}>Design or branding request</AdminButton>
          </div>
        </div>
        {presetNotice && <p className="admin-inline-note" role="status">{presetNotice}</p>}
        {customOrder.fields.length === 0
          ? <p className="admin-inline-note">No questions added. Add one or use a quick start.</p>
          : <div className="admin-config-list" ref={questionListRef}>
            {customOrder.fields.map((field, fieldIndex) => (
              <details className="admin-config-item" key={`${field.id}-${fieldIndex}`}>
                <summary>{field.label || 'Untitled question'}</summary>
                <div className="admin-config-item-body">
                  <div className="admin-form-grid">
                    <AdminInput id={`custom-${fieldIndex}-label`} label="Question" value={field.label} onChange={(label) => updateCustomField(fieldIndex, (current) => ({ ...current, label }))} />
                    <AdminSelect id={`custom-${fieldIndex}-type`} label="Answer type" value={field.type} hint="Changing this keeps the question label and its saved identifier." onChange={(type) => updateCustomField(fieldIndex, (current) => {
                      const nextType = type as CustomFieldDraft['type'];
                      if (current.type === nextType) return current;
                      return createField(nextType, current.label, current.id);
                    })} options={fieldTypes} />
                    <AdminToggle id={`custom-${fieldIndex}-required`} label="Customers must answer" checked={field.required} onChange={(required) => updateCustomField(fieldIndex, (current) => ({ ...current, required }))} />
                    <AdminTextarea id={`custom-${fieldIndex}-help`} label="Help for customers (optional)" value={field.help_text} onChange={(help_text) => updateCustomField(fieldIndex, (current) => ({ ...current, help_text }))} />
                    {field.type === 'text' || field.type === 'textarea'
                      ? <>
                        <AdminNumberInput id={`custom-${fieldIndex}-max-length`} label="Maximum answer length" value={field.max_length} onChange={(max_length) => updateCustomField(fieldIndex, (current) => current.type === 'text' || current.type === 'textarea' ? { ...current, max_length } : current)} min={1} max={2000} />
                        <AdminInput id={`custom-${fieldIndex}-placeholder`} label="Example answer (optional)" value={field.placeholder} onChange={(placeholder) => updateCustomField(fieldIndex, (current) => current.type === 'text' || current.type === 'textarea' ? { ...current, placeholder } : current)} />
                      </>
                      : field.type === 'number'
                        ? <>
                          <AdminNumberInput id={`custom-${fieldIndex}-min`} label="Smallest answer" value={field.min} onChange={(min) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, min } : current)} step="any" />
                          <AdminNumberInput id={`custom-${fieldIndex}-max`} label="Largest answer" value={field.max} onChange={(max) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, max } : current)} step="any" />
                          <AdminNumberInput id={`custom-${fieldIndex}-step`} label="Answer increments" value={field.step} onChange={(step) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, step } : current)} step="any" />
                          <AdminInput id={`custom-${fieldIndex}-unit`} label="Unit" value={field.unit} onChange={(unit) => updateCustomField(fieldIndex, (current) => current.type === 'number' ? { ...current, unit } : current)} hint="For example, cm or kg." />
                        </>
                        : field.type === 'measurement'
                          ? <>
                            <AdminNumberInput id={`custom-${fieldIndex}-min`} label="Smallest measurement" value={field.min} onChange={(min) => updateCustomField(fieldIndex, (current) => current.type === 'measurement' ? { ...current, min } : current)} step="any" />
                            <AdminNumberInput id={`custom-${fieldIndex}-max`} label="Largest measurement" value={field.max} onChange={(max) => updateCustomField(fieldIndex, (current) => current.type === 'measurement' ? { ...current, max } : current)} step="any" />
                            <AdminSelect id={`custom-${fieldIndex}-unit`} label="Measurement unit" value={field.unit} onChange={(unit) => updateCustomField(fieldIndex, (current) => current.type === 'measurement' ? { ...current, unit: unit as 'cm' | 'in' } : current)} options={[{ value: 'cm', label: 'Centimetres (cm)' }, { value: 'in', label: 'Inches (in)' }]} />
                          </>
                          : <div className="admin-config-sublist">
                            {field.values.map((value, valueIndex) => (
                              <div className="admin-config-quick-add-fields" key={`${field.id}-answer-${valueIndex}`}>
                                <AdminInput id={`custom-${fieldIndex}-choice-${valueIndex}`} label={`Answer ${valueIndex + 1}`} value={value} onChange={(nextValue) => updateCustomField(fieldIndex, (current) => current.type === 'choice' ? { ...current, values: current.values.map((item, index) => index === valueIndex ? nextValue : item) } : current)} />
                                <AdminButton type="button" variant="danger" disabled={field.values.length <= 1} onClick={() => updateCustomField(fieldIndex, (current) => current.type === 'choice' ? { ...current, values: current.values.filter((_, index) => index !== valueIndex) } : current)}>Remove answer</AdminButton>
                              </div>
                            ))}
                            <AdminButton type="button" variant="secondary" disabled={field.values.length >= 30} onClick={() => updateCustomField(fieldIndex, (current) => current.type === 'choice' ? { ...current, values: [...current.values, ''] } : current)}>Add an answer</AdminButton>
                          </div>}
                  </div>
                  <div className="admin-form-actions">
                    <AdminButton type="button" variant="secondary" disabled={fieldIndex === 0} onClick={() => onCustomOrderChange({ ...customOrder, fields: reorder(customOrder.fields, fieldIndex, fieldIndex - 1) })}>Move up</AdminButton>
                    <AdminButton type="button" variant="secondary" disabled={fieldIndex === customOrder.fields.length - 1} onClick={() => onCustomOrderChange({ ...customOrder, fields: reorder(customOrder.fields, fieldIndex, fieldIndex + 1) })}>Move down</AdminButton>
                    <AdminButton type="button" variant="danger" onClick={() => onCustomOrderChange({ ...customOrder, fields: customOrder.fields.filter((_, index) => index !== fieldIndex) })}>Remove question</AdminButton>
                  </div>
                </div>
              </details>
            ))}
          </div>}
      </>}
    </AdminCard>
  );
}

export function productOptionsToDraft(groups: ProductOptionGroup[]): OptionGroupDraft[] {
  return groups.map(optionGroupToDraft);
}

export function customFieldsToDraft(fields: CustomRequestField[]): CustomFieldDraft[] {
  return fields.map(customFieldToDraft);
}
