import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "./Stepper";

function renderStepper(value: number, min?: number) {
  const onChange = vi.fn();
  render(
    <Stepper
      label="كيكات"
      value={value}
      onChange={onChange}
      min={min}
      incrementLabel="زيد كيكة"
      decrementLabel="نقّص كيكة"
    />,
  );
  return onChange;
}

describe("Stepper", () => {
  it("shows the label and the current value", () => {
    renderStepper(4);
    expect(screen.getByText("كيكات")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4");
  });

  it("adds one when the plus button is pressed", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(4);
    await user.click(screen.getByRole("button", { name: "زيد كيكة" }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("subtracts one when the minus button is pressed", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(4);
    await user.click(screen.getByRole("button", { name: "نقّص كيكة" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("disables minus at zero so counts never go negative", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(0);
    const minus = screen.getByRole("button", { name: "نقّص كيكة" });
    expect(minus).toBeDisabled();
    await user.click(minus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects a custom minimum", () => {
    renderStepper(1, 1);
    expect(screen.getByRole("button", { name: "نقّص كيكة" })).toBeDisabled();
  });
});
