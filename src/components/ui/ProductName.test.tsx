import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductName } from "./ProductName";

describe("ProductName", () => {
  it("lets the text pick its direction (English cakes, Arabic packaging)", () => {
    render(<ProductName name="Black & White" />);
    expect(screen.getByText("Black & White")).toHaveAttribute("dir", "auto");
  });
});
