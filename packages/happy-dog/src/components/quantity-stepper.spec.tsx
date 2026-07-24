// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuantityStepper } from "./quantity-stepper";

afterEach(cleanup);

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("QuantityStepper", () => {
  it("increments and decrements within [min, max]", () => {
    const onValueChange = vi.fn();
    render(<QuantityStepper value={2} min={1} max={3} onValueChange={onValueChange} />);

    fireEvent.click(button("Increase quantity"));
    expect(onValueChange).toHaveBeenLastCalledWith(3);

    fireEvent.click(button("Decrease quantity"));
    expect(onValueChange).toHaveBeenLastCalledWith(1);
  });

  it("disables steppers at the bounds", () => {
    render(<QuantityStepper value={1} min={1} max={1} onValueChange={() => {}} />);
    expect(button("Increase quantity").disabled).toBe(true);
    expect(button("Decrease quantity").disabled).toBe(true);
  });

  it("clamps out-of-range values for display", () => {
    const { container } = render(<QuantityStepper value={10} min={1} max={5} onValueChange={() => {}} />);
    expect(container.querySelector("output")?.textContent).toBe("5");
  });

  it("disables both buttons when disabled", () => {
    render(<QuantityStepper value={2} disabled onValueChange={() => {}} />);
    expect(button("Increase quantity").disabled).toBe(true);
    expect(button("Decrease quantity").disabled).toBe(true);
  });
});
