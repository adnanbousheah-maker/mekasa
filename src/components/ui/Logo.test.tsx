import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders the Mekasa logo with Arabic alt text", () => {
    render(<Logo size="lg" />);
    expect(screen.getByAltText("ميكاسا")).toHaveClass("mix-blend-multiply");
  });
});
