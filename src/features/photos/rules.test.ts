import { describe, expect, it } from "vitest";
import { PHOTO_BUCKETS, PHOTO_MAX_BYTES, PHOTO_TYPES } from "./rules";

describe("photo rules", () => {
  it("allows the private location buckets and image types only", () => {
    expect(PHOTO_BUCKETS).toEqual(["count-photos", "waste-photos", "invoices"]);
    expect(Object.keys(PHOTO_TYPES)).toEqual(["image/jpeg", "image/png", "image/webp"]);
    // تحت حد الـ server actions (4MB) مع مكان للـ multipart
    expect(PHOTO_MAX_BYTES).toBeLessThan(4 * 1024 * 1024);
  });
});
