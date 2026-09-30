import { Autocomplete } from '@heroui/react/autocomplete';
import { FieldError } from '@heroui/react/field-error';
import { ListBox } from '@heroui/react/list-box';
import { SearchField } from '@heroui/react/search-field';
import { Select } from '@heroui/react/select';
import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Key, ReactNode } from 'react';

type Option = { value: string; label: string; disabled: boolean };
type Change = { target: { value: string } };

const contains = (text: string, input: string) => {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  return normalize(text).includes(normalize(input));
};

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

function getOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child) || child.type !== 'option') return [];
    const label = textOf(child.props.children).trim();
    const value = child.props.value === undefined ? label : String(child.props.value);
    return [{ value, label, disabled: !!child.props.disabled || value === '' }];
  });
}

export function SelectField({ name, value, defaultValue, onChange, children, className, required, disabled, searchable, placeholder = 'Selecciona una opción', 'aria-label': ariaLabel }: SelectFieldProps) {
  const id = useId().replaceAll(':', '');
  const root = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const options = useMemo(() => getOptions(children), [children]);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? options[0]?.value ?? '');
  const selectedValue = controlled ? String(value ?? '') : uncontrolledValue;
  const [invalid, setInvalid] = useState(false);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [inferredLabel, setInferredLabel] = useState('');
  const descriptionId = required && invalid ? `select-error-${id}` : undefined;
  const fieldLabel = ariaLabel ?? inferredLabel ?? 'Seleccionar opción';
  const selectableOptions = options.filter((option) => option.value !== '');

  useEffect(() => {
    const trigger = root.current?.querySelector<HTMLElement>('.select-field__trigger');
    const label = root.current?.closest('label');
    const triggerText = trigger?.textContent?.trim() ?? '';
    setInferredLabel(label?.textContent?.replace(triggerText, '').trim() ?? '');
  }, [selectedValue, searchable]);

  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form || !required || selectedValue) {
      setInvalid(false);
      return;
    }
    const validate = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setInvalid(true);
      root.current?.querySelector<HTMLElement>('.select-field__trigger')?.focus();
    };
    form.addEventListener('submit', validate);
    return () => form.removeEventListener('submit', validate);
  }, [required, selectedValue]);

  const choose = (key: Key | null) => {
    const nextValue = key === null ? '' : String(key);
    const option = selectableOptions.find((entry) => entry.value === nextValue);
    if (nextValue && (!option || option.disabled)) return;
    if (!controlled) setUncontrolledValue(nextValue);
    onChange?.({ target: { value: nextValue } });
    setInvalid(false);
  };

  const listOptions = selectableOptions.map((option) => (
    <ListBox.Item key={option.value} id={option.value} textValue={option.label} isDisabled={option.disabled} className="select-field__option">
      {option.label}
      <ListBox.ItemIndicator aria-hidden="true" />
    </ListBox.Item>
  ));

  return (
    <div className={`select-field${invalid ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`} ref={root}>
      {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} /> : null}
      {searchable ? (
        <Autocomplete.Root
          value={selectedValue || null}
          isOpen={autocompleteOpen}
          onOpenChange={setAutocompleteOpen}
          onChange={choose}
          fullWidth
          isDisabled={disabled}
          isRequired={required}
          isInvalid={invalid}
          placeholder={placeholder}
          aria-label={fieldLabel || 'Seleccionar opción'}
          className="select-field__root"
        >
          <Autocomplete.Trigger className="select-field__trigger">
            <Autocomplete.Value />
            <Autocomplete.Indicator aria-hidden="true" />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className="select-field__popover" placement="bottom">
            <Autocomplete.Filter filter={contains}>
              <SearchField className="select-field__search" aria-label={`Buscar en ${fieldLabel || 'opciones'}`}>
                <SearchField.Group>
                  <SearchField.SearchIcon aria-hidden="true" />
                  <SearchField.Input
                    placeholder="Buscar opción…"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setAutocompleteOpen(false);
                      }
                    }}
                  />
                </SearchField.Group>
              </SearchField>
              <ListBox className="select-field__options" renderEmptyState={() => <div className="select-field__empty">No hay coincidencias.</div>}>
                {listOptions}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
          {descriptionId ? <FieldError id={descriptionId} className="select-field__error">Selecciona una opción.</FieldError> : null}
        </Autocomplete.Root>
      ) : (
        <Select.Root
          value={selectedValue || null}
          onChange={choose}
          fullWidth
          isDisabled={disabled}
          isRequired={required}
          isInvalid={invalid}
          placeholder={placeholder}
          aria-label={fieldLabel || 'Seleccionar opción'}
          className="select-field__root"
        >
          <Select.Trigger className="select-field__trigger">
            <Select.Value />
            <Select.Indicator aria-hidden="true" />
          </Select.Trigger>
          <Select.Popover className="select-field__popover" placement="bottom">
            <ListBox className="select-field__options">{listOptions}</ListBox>
          </Select.Popover>
          {descriptionId ? <FieldError id={descriptionId} className="select-field__error">Selecciona una opción.</FieldError> : null}
        </Select.Root>
      )}
    </div>
  );
}

export function SearchSelect(props: Omit<SelectFieldProps, 'searchable'>) {
  return <SelectField {...props} searchable />;
}
