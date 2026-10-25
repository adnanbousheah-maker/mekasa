import { describe, expect, it } from "vitest";
import { ROLE_LABELS, roleLocationProblem } from "./roles";

describe("roleLocationProblem", () => {
  it("accepts branch staff at a branch", () => {
    expect(roleLocationProblem(["branch_staff"], "branch")).toBeNull();
  });

  it("accepts factory roles at the factory", () => {
    expect(roleLocationProblem(["dispatcher", "storekeeper"], "factory")).toBeNull();
  });

  it("accepts an admin anywhere, even without a location", () => {
    expect(roleLocationProblem(["admin"], null)).toBeNull();
    expect(roleLocationProblem(["admin", "storekeeper"], "factory")).toBeNull();
  });

  it("rejects branch staff at the factory", () => {
    expect(roleLocationProblem(["branch_staff"], "factory")).toBe("موظف فرع لازم يكون بفرع");
  });

  it("rejects factory roles at a branch", () => {
    expect(roleLocationProblem(["storekeeper"], "branch")).toBe("أمين المستودع لازم يكون بالمصنع");
  });

  it("needs a location for anyone who is not only an admin", () => {
    expect(roleLocationProblem(["dispatcher"], null)).toBe("اختار الموقع");
  });

  it("lets a packaging keeper work from any location, but still needs one", () => {
    expect(roleLocationProblem(["branch_staff", "packaging_keeper"], "branch")).toBeNull();
    expect(roleLocationProblem(["packaging_keeper"], "factory")).toBeNull();
    expect(roleLocationProblem(["packaging_keeper"], "packaging")).toBeNull();
    expect(roleLocationProblem(["packaging_keeper"], null)).toBe("اختار الموقع");
  });

  it("needs at least one role", () => {
    expect(roleLocationProblem([], "branch")).toBe("اختار دور واحد على الأقل");
  });
});

describe("ROLE_LABELS", () => {
  it("uses the design's Arabic names", () => {
    expect(ROLE_LABELS.dispatcher).toBe("الإخراج");
    expect(ROLE_LABELS.storekeeper).toBe("أمين المستودع");
  });
});
