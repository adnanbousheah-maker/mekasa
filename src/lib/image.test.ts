import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage, fitWithin } from "./image";

describe("fitWithin", () => {
  it("scales the longest side down and keeps the ratio", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe("compressImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws the photo at the smaller size and encodes a JPEG", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    const drawImage = vi.fn();
    const out = new Blob(["x"], { type: "image/jpeg" });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      cb,
    ) {
      cb(out);
    });

    await expect(compressImage(new Blob(["raw"]))).resolves.toBe(out);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
    expect(close).toHaveBeenCalled();
  });

  it("fails clearly when the photo cannot be encoded", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(null));
    await expect(compressImage(new Blob(["raw"]))).rejects.toThrow("Could not encode the photo");
  });
});
