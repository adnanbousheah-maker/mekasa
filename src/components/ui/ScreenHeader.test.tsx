import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenHeader } from "./ScreenHeader";

describe("ScreenHeader", () => {
  it("shows the title, subtitle and a back link home by default", () => {
    render(<ScreenHeader title="جرد الساعة 9:00" subtitle="فرع الصويفية" />);
    expect(screen.getByRole("heading", { name: "جرد الساعة 9:00" })).toBeInTheDocument();
    expect(screen.getByText("فرع الصويفية")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "رجوع" })).toHaveAttribute("href", "/");
  });

  it("can go back somewhere else and show an extra element", () => {
    render(
      <ScreenHeader title="راجع الأرقام" backHref="/count" aside={<button type="button">الصورة</button>} />,
    );
    expect(screen.getByRole("link", { name: "رجوع" })).toHaveAttribute("href", "/count");
    expect(screen.getByRole("button", { name: "الصورة" })).toBeInTheDocument();
  });
});

describe("StaffScreen", () => {
  it("wraps content in the main landmark and has a loading state", async () => {
    const { StaffScreen, StaffLoading } = await import("./StaffScreen");
    const { unmount } = render(<StaffScreen>محتوى</StaffScreen>);
    expect(screen.getByRole("main")).toHaveTextContent("محتوى");
    unmount();
    render(<StaffLoading />);
    expect(screen.getByRole("main")).toHaveTextContent("لحظة…");
  });
});

describe("AdminLoading", () => {
  it("says to wait", async () => {
    const { AdminLoading } = await import("./AdminLoading");
    render(<AdminLoading />);
    expect(screen.getByText("لحظة…")).toBeInTheDocument();
  });
});
