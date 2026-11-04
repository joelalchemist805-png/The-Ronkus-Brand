import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { toast } from 'sonner';

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

type TextFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function AdminInput({
  id,
  label,
  error,
  hint,
  value,
  onChange,
  ...props
}: TextFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {error && <span id={`${id}-error`} className="admin-field-error">{error}</span>}
      {!error && hint && <span id={`${id}-hint`} className="admin-field-hint">{hint}</span>}
    </div>
  );
}

export function AdminNumberInput(props: TextFieldProps) {
  return <AdminInput {...props} type="number" step={props.step ?? 1} />;
}

export function AdminNairaInput(props: TextFieldProps) {
  const { id, label, error, hint, value, onChange, ...inputProps } = props;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <div className="admin-money-input">
        <span aria-hidden="true">₦</span>
        <input
          {...inputProps}
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      </div>
      {error && <span id={`${id}-error`} className="admin-field-error">{error}</span>}
      {!error && hint && <span id={`${id}-hint`} className="admin-field-hint">{hint}</span>}
    </div>
  );
}

type SelectProps = FieldProps & {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
};

export function AdminSelect({ id, label, error, hint, value, onChange, options, disabled }: SelectProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {error && <span id={`${id}-error`} className="admin-field-error">{error}</span>}
      {!error && hint && <span id={`${id}-hint`} className="admin-field-hint">{hint}</span>}
    </div>
  );
}

type TextareaProps = FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function AdminTextarea({ id, label, error, hint, value, onChange, ...props }: TextareaProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...props}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {error && <span id={`${id}-error`} className="admin-field-error">{error}</span>}
      {!error && hint && <span id={`${id}-hint`} className="admin-field-hint">{hint}</span>}
    </div>
  );
}

type ToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function AdminToggle({ id, label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="admin-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="admin-toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
};

export function AdminButton({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button {...props} className={`admin-button admin-button-${variant} ${className}`} />;
}

export function AdminCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`admin-card ${className}`}>{children}</section>;
}

export function AdminPageHeader({ title, description, children }: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function LoadingState({ label = 'Loading admin data…' }: { label?: string }) {
  return <div className="admin-loading" role="status"><span className="admin-spinner" />{label}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}

export function ConfirmDialog({
  label,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  children,
}: {
  label: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [open]);

  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The action could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      {open && (
          <dialog
            ref={dialogRef}
            className="admin-dialog"
            aria-labelledby="admin-dialog-title"
            aria-describedby="admin-dialog-message"
            onCancel={(event) => {
              event.preventDefault();
              if (!working) setOpen(false);
            }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const clickedBackdrop = event.clientX < rect.left
                || event.clientX > rect.right
                || event.clientY < rect.top
                || event.clientY > rect.bottom;
              if (clickedBackdrop && !working) setOpen(false);
            }}
          >
            <h2 id="admin-dialog-title">{label}</h2>
            <p id="admin-dialog-message">{message}</p>
            <div className="admin-dialog-actions">
              <AdminButton type="button" variant="secondary" disabled={working} autoFocus onClick={() => setOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton type="button" variant="danger" disabled={working} onClick={() => void confirm()}>
                {working ? 'Working…' : confirmLabel}
              </AdminButton>
            </div>
          </dialog>
      )}
    </>
  );
}
