import type { HTMLAttributes, ReactNode } from "react";

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export default function Field({
  label,
  htmlFor,
  hint,
  error,
  className = "",
  children,
  ...rest
}: FieldProps) {
  return (
    <div className={["ui-field", className].filter(Boolean).join(" ")} {...rest}>
      <label className="ui-field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="ui-field__error" role="alert">{error}</p>
      ) : hint ? (
        <p className="ui-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
