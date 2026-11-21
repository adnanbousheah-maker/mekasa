import { afterEach, describe, expect, it } from "vitest";
import { clearDraft, DRAFT_MAX_AGE_MS, readDraft, writeDraft } from "./draft";

describe("count draft", () => {
  afterEach(() => clearDraft("t"));

  it("keeps the numbers and the start time", () => {
    const startedAt = new Date().toISOString();
    writeDraft("t", { a: 3 }, startedAt);
    expect(readDraft<{ a: number }>("t")).toMatchObject({ value: { a: 3 }, startedAt });
  });

  it("drops a draft that started too long ago, so the count is not refused", () => {
    const startedAt = new Date(Date.now() - DRAFT_MAX_AGE_MS - 60_000).toISOString();
    writeDraft("t", { a: 3 }, startedAt);
    expect(readDraft("t")).toBeNull();
    expect(window.localStorage.getItem("mekasa:count-draft:t")).toBeNull();
  });

  it("is gone after clearing", () => {
    writeDraft("t", { a: 1 }, new Date().toISOString());
    clearDraft("t");
    expect(readDraft("t")).toBeNull();
  });
});
