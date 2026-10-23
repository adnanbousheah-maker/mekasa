import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Quantity } from "./Quantity";

describe("Quantity", () => {
  it("renders cakes and pieces", () => {
    render(<Quantity pieces={35} piecesPerCake={10} />);
    expect(screen.getByText("3 كيكات + 5 قطع")).toBeInTheDocument();
  });

  it("renders the compact table form", () => {
    render(<Quantity pieces={35} piecesPerCake={10} compact />);
    expect(screen.getByText("3 ك · 5 ق")).toBeInTheDocument();
  });

  it("colors negative stock as a problem", () => {
    render(<Quantity pieces={-5} piecesPerCake={null} />);
    expect(screen.getByText("−5 قطع")).toHaveClass("text-danger");
  });
});
