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
});
