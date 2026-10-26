"use client";

import { Children, Fragment, isValidElement, useMemo, useState, type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChoiceSelect, type Choice } from "@/components/ui/ChoiceSelect";

type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode; hidden?: boolean };

const textOf = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
};

/** The <option>s inside the children (also inside fragments, lists and groups), as choices. */
function optionsOf(children: ReactNode, into: Choice[] = []): Choice[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<OptionProps & { children?: ReactNode }>;
    if (el.type === "option") {
      if (el.props.disabled && el.props.hidden) return;
      const label = textOf(el.props.children).trim();
      into.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label });
    } else if (el.type === "optgroup" || el.type === Fragment || typeof el.type === "string") {
      optionsOf(el.props.children, into);
    }
  });
  return into;
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue" | "multiple"> & {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
};

/**
 * Drop-in for a <select>: the same props and <option> children, but the options are found by typing (search), then chosen. Only an option of the
 * list is accepted. A select that is required does not offer its empty "Select ..." option as a choice (its text is the hint of the box instead).
 */
export function Select({ value, defaultValue, onChange, name, id, required, disabled, className, children, ...rest }: Props) {
  const all = useMemo(() => optionsOf(children), [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue !== undefined ? String(defaultValue) : (all[0]?.value ?? ""));
  const current = controlled ? String(value ?? "") : inner;

  // a required select starts at its empty "Select ..." option, which is only the hint of the box
  const hint = required ? all.find((o) => o.value === "")?.label : undefined;
  const options = required ? all.filter((o) => o.value !== "") : all;

  return (
    <ChoiceSelect
      id={id}
      name={name}
      required={required}
      disabled={disabled}
      className={className}
      value={current}
      ariaLabel={rest["aria-label"]}
      placeholder={hint}
      options={options}
      onChange={(v) => {
        if (!controlled) setInner(v);
        // the event the handlers of a native select expect: the chosen value as target.value / currentTarget.value
        const target = { value: v, name: name ?? "", id: id ?? "" };
        onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
      }}
    />
  );
}
