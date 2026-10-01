import { Children, cloneElement, isValidElement } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Input types that are not text-like and must keep their native chrome. */
const NON_TEXT_INPUTS = ["checkbox", "radio", "color", "range", "file"];

type ControlProps = { className?: string; type?: string };

/**
 * Stamps `.ui-input` onto a plain input/select/textarea child so the control
 * styling travels with the class rather than depending on a descendant
 * selector. Anything else — a wrapper, a custom component, a checkbox — is
 * returned untouched.
 */
function withInputClass(child: ReactNode): ReactNode {
  if (!isValidElement(child)) return child;
  const type = child.type;
  if (type !== "input" && type !== "select" && type !== "textarea") return child;

  const props = child.props as ControlProps;
  if (type === "input" && props.type && NON_TEXT_INPUTS.includes(props.type)) {
    return child;
  }

  const className = ["ui-input", props.className].filter(Boolean).join(" ");
  return cloneElement(child as ReactElement<ControlProps>, { className });
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
      {Children.map(children, withInputClass)}
      {error ? (
        <p className="ui-field__error" role="alert">{error}</p>
      ) : hint ? (
        <p className="ui-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
