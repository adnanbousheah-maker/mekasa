import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductName } from "./ProductName";

describe("ProductName", () => {
  it("renders English names left-to-right", () => {
    render(<ProductName name="Black & White" />);
    expect(screen.getByText("Black & White")).toHaveAttribute("dir", "ltr");
  });
});
