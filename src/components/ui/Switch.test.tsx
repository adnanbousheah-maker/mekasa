import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("is a named switch that reports its state", () => {
    render(<Switch checked label="الجرد بالصورة" onChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "الجرد بالصورة" })).toHaveAttribute("aria-checked", "true");
  });

  it("asks for the opposite state when pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} label="الإرجاع" onChange={onChange} size="sm" />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked label="فعّال" onChange={onChange} disabled />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
