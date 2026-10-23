import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, ButtonLink, buttonClass } from "./Button";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>تأكيد</Button>);
    expect(screen.getByRole("button", { name: "تأكيد" })).toHaveAttribute("type", "button");
  });

  it("calls onClick when tapped", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>تأكيد</Button>);
    await user.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps the 48px minimum on the medium size", () => {
    expect(buttonClass("secondary", "md")).toContain("h-12");
    expect(buttonClass()).toContain("h-14");
  });
});

describe("ButtonLink", () => {
  it("renders a link styled as a button", () => {
    render(
      <ButtonLink href="/count" variant="warning">
        ابدأ الجرد الآن
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "ابدأ الجرد الآن" });
    expect(link).toHaveAttribute("href", "/count");
    expect(link).toHaveClass("bg-warn");
  });
});
