import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Field from "../Field";

describe("Field", () => {
  it("associates the label with the control", () => {
    render(
      <Field label="Name" htmlFor="name">
        <input id="name" />
      </Field>
    );
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("renders a hint when given one", () => {
    render(
      <Field label="Name" htmlFor="name" hint="Your full name">
        <input id="name" />
      </Field>
    );
    expect(screen.getByText("Your full name")).toBeTruthy();
  });

  it("renders an error and hides the hint when both are given", () => {
    render(
      <Field label="Name" htmlFor="name" hint="Your full name" error="Required">
        <input id="name" />
      </Field>
    );
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.queryByText("Your full name")).toBe(null);
  });

  it("marks the error with an alert role", () => {
    render(
      <Field label="Name" htmlFor="name" error="Required">
        <input id="name" />
      </Field>
    );
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });

  it("merges a caller-supplied className rather than replacing", () => {
    const { container } = render(
      <Field label="Name" htmlFor="name" className="extra">
        <input id="name" />
      </Field>
    );
    const el = container.firstElementChild!;
    expect(el.className.includes("extra")).toBe(true);
    expect(el.className.includes("ui-field")).toBe(true);
  });

  it("passes arbitrary DOM attributes through", () => {
    const { container } = render(
      <Field label="Name" htmlFor="name" id="f1" data-section="profile">
        <input id="name" />
      </Field>
    );
    const el = container.firstElementChild!;
    expect(el.id).toBe("f1");
    expect(el.getAttribute("data-section")).toBe("profile");
  });

  it("stamps .ui-input onto a text input child", () => {
    render(
      <Field label="Name" htmlFor="name">
        <input id="name" className="mine" />
      </Field>
    );
    const el = screen.getByLabelText("Name");
    expect(el.className.includes("ui-input")).toBe(true);
    // The child's own className survives.
    expect(el.className.includes("mine")).toBe(true);
  });

  it("stamps .ui-input onto select and textarea children", () => {
    const { container } = render(
      <Field label="Bio" htmlFor="bio">
        <textarea id="bio" />
      </Field>
    );
    expect(container.querySelector("textarea")!.className.includes("ui-input")).toBe(true);
  });

  it("leaves non-text inputs alone", () => {
    const { container } = render(
      <Field label="Accent" htmlFor="accent">
        <input id="accent" type="color" />
      </Field>
    );
    expect(container.querySelector("input")!.className.includes("ui-input")).toBe(false);
  });

  it("leaves a wrapped or custom child alone", () => {
    const { container } = render(
      <Field label="Name" htmlFor="name">
        <div className="wrapper"><input id="name" /></div>
      </Field>
    );
    expect(container.querySelector(".wrapper")!.className.includes("ui-input")).toBe(false);
    expect(container.querySelector("input")!.className.includes("ui-input")).toBe(false);
  });
});
