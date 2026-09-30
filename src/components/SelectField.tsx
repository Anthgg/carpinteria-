import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

type Option = { value: string; label: string; disabled: boolean };
type Change = { target: { value: string } };
export type SelectFieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: Change) => void;
  children?: ReactNode;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  placeholder?: string;
  'aria-label'?: string;
};

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return Children.toArray(node).map(textOf).join('');
}

export function SelectField({ name, value, defaultValue, onChange, children, className, required, disabled, searchable, placeholder = 'Selecciona una opción', 'aria-label': ariaLabel }: SelectFieldProps) {
  const id = useId().replaceAll(':', '');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const options = useMemo(() => Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child) || child.type !== 'option') return [];
    const label = textOf(child.props.children).trim();
    const optionValue = child.props.value === undefined ? label : String(child.props.value);
    return [{ value: optionValue, label, disabled: !!child.props.disabled || optionValue === '' }];
  }), [children]);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? options[0]?.value ?? '');
  const selectedValue = controlled ? String(value ?? '') : uncontrolledValue;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [inferredLabel, setInferredLabel] = useState('');
  const optionList = options.filter((option) => option.value !== '' || option.label !== '');
  const selected = options.find((option) => option.value === selectedValue);
  const visibleOptions = searchable ? optionList.filter((option) => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : optionList;
  const firstEnabledIndex = Math.max(0, visibleOptions.findIndex((option) => !option.disabled));
  const lastEnabledIndex = Math.max(0, visibleOptions.reduce((last, option, index) => option.disabled ? last : index, -1));
  const descriptionId = required && invalid ? `${id}-error` : undefined;

  useEffect(() => {
    const label = trigger.current?.closest('label');
    const controlText = trigger.current?.textContent?.trim() ?? '';
    setInferredLabel(label?.textContent?.replace(controlText, '').trim() ?? '');
  }, [selected?.label]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => {
    if (!open || !searchable) return;
    requestAnimationFrame(() => searchInput.current?.focus());
  }, [open, searchable]);
  useEffect(() => {
    const form = trigger.current?.closest('form');
    if (!form || !required || selectedValue) { setInvalid(false); return; }
    const validate = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setInvalid(true);
      trigger.current?.focus();
    };
    form.addEventListener('submit', validate);
    return () => form.removeEventListener('submit', validate);
  }, [required, selectedValue]);

  const choose = (option: Option) => {
    if (option.disabled) return;
    if (!controlled) setUncontrolledValue(option.value);
    onChange?.({ target: { value: option.value } });
    setInvalid(false);
    setQuery('');
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const move = (direction: number) => {
    if (!visibleOptions.length) return;
    let next = activeIndex;
    for (let count = 0; count < visibleOptions.length; count += 1) {
      next = (next + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[next].disabled) break;
    }
    setActiveIndex(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(event.key === 'ArrowDown' ? firstEnabledIndex : lastEnabledIndex);
      }
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) choose(option);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); setQuery('');
    } else if (event.key === 'Home' && open) {
      event.preventDefault(); setActiveIndex(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault(); setActiveIndex(Math.max(0, visibleOptions.length - 1));
    }
  };

  return <div ref={root} className={`select-field${open ? ' is-open' : ''}${invalid ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
    {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} /> : null}
    <button ref={trigger} type="button" className="select-field__trigger" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} aria-activedescendant={open && visibleOptions[activeIndex] ? `${id}-option-${activeIndex}` : undefined} aria-label={(ariaLabel ?? inferredLabel) || 'Seleccionar opción'} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={descriptionId} disabled={disabled} onClick={() => { setOpen((current) => !current); setQuery(''); const selectedIndex = visibleOptions.findIndex((option) => option.value === selectedValue); setActiveIndex(selectedIndex >= 0 && !visibleOptions[selectedIndex].disabled ? selectedIndex : firstEnabledIndex); }} onKeyDown={onKeyDown}>
      <span className={selected ? '' : 'select-field__placeholder'}>{selected?.label || placeholder}</span><span className="select-field__chevron" aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="select-field__popup">
      {searchable ? <input ref={searchInput} className="select-field__search" value={query} onChange={(event) => { const nextQuery = event.target.value; const matches = optionList.filter((option) => option.label.toLocaleLowerCase().includes(nextQuery.toLocaleLowerCase())); setQuery(nextQuery); setActiveIndex(Math.max(0, matches.findIndex((option) => !option.disabled))); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(''); trigger.current?.focus(); } else if (event.key === 'ArrowDown') { event.preventDefault(); move(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); } else if (event.key === 'Enter') { event.preventDefault(); const option = visibleOptions[activeIndex]; if (option) choose(option); } }} placeholder="Buscar opción…" aria-label={ariaLabel ? `Buscar ${ariaLabel.toLowerCase()}` : 'Buscar opción'} /> : null}
      <ul className="select-field__options" id={`${id}-listbox`} role="listbox" aria-label={ariaLabel ?? 'Opciones'}>
        {visibleOptions.map((option, index) => <li id={`${id}-option-${index}`} key={`${option.value}-${index}`} role="option" aria-selected={option.value === selectedValue} aria-disabled={option.disabled || undefined} className={`select-field__option${option.value === selectedValue ? ' is-selected' : ''}${activeIndex === index ? ' is-active' : ''}${option.disabled ? ' is-disabled' : ''}`} onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(option); }}>{option.label}<span aria-hidden="true">{option.value === selectedValue ? '✓' : ''}</span></li>)}
        {!visibleOptions.length ? <li className="select-field__empty">No hay coincidencias</li> : null}
      </ul>
    </div> : null}
    {descriptionId ? <span className="select-field__error" id={descriptionId} role="alert">Selecciona una opción.</span> : null}
  </div>;
}

export function SearchSelect(props: Omit<SelectFieldProps, 'searchable'>) {
  return <SelectField {...props} searchable />;
}
