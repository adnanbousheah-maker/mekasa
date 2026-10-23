import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayBadge } from "./DayBadge";

describe("DayBadge", () => {
  it("shows the number in its fixed color", () => {
    render(<DayBadge day={1} />);
    const badge = screen.getByText("1");
    expect(badge).toHaveStyle({ backgroundColor: "#B42318" });
  });

  it("names the day for screen readers", () => {
    render(<DayBadge day={7} />);
    expect(screen.getByLabelText("رقم 7، الجمعة")).toBeInTheDocument();
  });
});
