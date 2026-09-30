import { Autocomplete } from '@heroui/react/autocomplete';
import { FieldError } from '@heroui/react/field-error';
import { Header } from '@heroui/react/header';
import { ListBox } from '@heroui/react/list-box';
import { SearchField } from '@heroui/react/search-field';
import { Select } from '@heroui/react/select';
import { Children, Fragment, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Key, ReactNode } from 'react';

type Option = { value: string; label: string; disabled: boolean; description?: string; search?: string; group?: string };
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
  searchPlaceholder?: string;
  emptyText?: string;
  'aria-label'?: string;
};

// Separación entre el campo y su lista: pequeña para que se lea como parte del mismo control.
const POPOVER_OFFSET = 4;

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return Children.toArray(node).map(textOf).join('');
}

function getOptions(children: ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    // <optgroup label="…"> se muestra como sección con cabecera; los fragmentos se recorren como si fueran planos.
    if (isValidElement<{ label?: string; children?: ReactNode }>(child) && child.type === 'optgroup') return getOptions(child.props.children, child.props.label);
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) return getOptions(child.props.children, group);
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean; 'data-description'?: string; 'data-search'?: string }>(child) || child.type !== 'option') return [];
    const label = textOf(child.props.children).trim();
    const value = child.props.value === undefined ? label : String(child.props.value);
    // Texto secundario opcional (data-description) y términos de búsqueda adicionales (data-search: código, tipo, "18 mm").
    return [{ value, label, disabled: !!child.props.disabled || value === '', description: child.props['data-description'], search: child.props['data-search'], group }];
  });
}

export function SelectField({ name, value, defaultValue, onChange, children, className, required, disabled, searchable, placeholder = 'Selecciona una opción', searchPlaceholder = 'Buscar…', emptyText = 'No hay coincidencias.', 'aria-label': ariaLabel }: SelectFieldProps) {
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

  const renderOption = (option: Option) => (
    <ListBox.Item key={option.value} id={option.value} textValue={option.search ? `${option.label} ${option.search}` : option.label} isDisabled={option.disabled} className={`select-field__option${option.description ? ' select-field__option--rich' : ''}`}>
      {option.description ? <span className="select-field__option-text"><span>{option.label}</span><small>{option.description}</small></span> : option.label}
      <ListBox.ItemIndicator aria-hidden="true" className="select-field__check" />
    </ListBox.Item>
  );
  const groups = [...new Set(selectableOptions.map((option) => option.group))];
  const listOptions = groups.length > 1 || groups[0]
    ? groups.map((group) => (
      <ListBox.Section key={group ?? 'otros'} className="select-field__section">
        <Header className="select-field__section-header">{group ?? 'Otros'}</Header>
        {selectableOptions.filter((option) => option.group === group).map(renderOption)}
      </ListBox.Section>
    ))
    : selectableOptions.map(renderOption);

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
          <Autocomplete.Popover className="select-field__popover" placement="bottom start" offset={POPOVER_OFFSET}>
            <Autocomplete.Filter filter={contains}>
              <SearchField className="select-field__search" aria-label={`Buscar en ${fieldLabel || 'opciones'}`}>
                <SearchField.Group>
                  <SearchField.SearchIcon aria-hidden="true" />
                  <SearchField.Input
                    placeholder={searchPlaceholder}
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
              <ListBox className="select-field__options" renderEmptyState={() => <div className="select-field__empty">{emptyText}</div>}>
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
          <Select.Popover className="select-field__popover" placement="bottom start" offset={POPOVER_OFFSET}>
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
