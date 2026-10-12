import { afterEach, describe, expect, it } from "vitest";
import {
  decryptJson,
  decryptRow,
  decryptText,
  encryptJson,
  encryptRow,
  encryptText,
  isEncrypted,
  resetFieldKeyCache,
} from "../src/lib/field-crypto.js";

const TEST_KEY = process.env.DATA_ENCRYPTION_KEY!;

afterEach(() => {
  process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
  resetFieldKeyCache();
});

describe("field-crypto", () => {
  it("round trips text and never stores it readable", () => {
    const stored = encryptText("Ask Dr Sato about sleep", "Note.body");
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("Sato");
    expect(decryptText(stored, "Note.body")).toBe("Ask Dr Sato about sleep");
  });

  it("uses a fresh nonce, so the same text never encrypts the same way twice", () => {
    expect(encryptText("same", "Note.body")).not.toBe(encryptText("same", "Note.body"));
  });

  it("refuses a value moved to a different field", () => {
    const stored = encryptText("Estradiol", "Treatment.name");
    expect(() => decryptText(stored, "Note.body")).toThrow();
  });

  it("refuses a tampered value", () => {
    const stored = encryptText("private", "Note.body");
    const [iv, tag, ct] = stored.slice("enc:v1:".length).split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      decryptText(`enc:v1:${iv}.${tag}.${flipped.toString("base64url")}`, "Note.body"),
    ).toThrow();
  });

  it("refuses to decrypt with a different key", () => {
    const stored = encryptText("private", "Note.body");
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    resetFieldKeyCache();
    expect(() => decryptText(stored, "Note.body")).toThrow();
  });

  it("reads text written before encryption as it is", () => {
    expect(decryptText("an old note", "Note.body")).toBe("an old note");
  });

  it("never encrypts a value twice", () => {
    const once = encryptText("x", "Note.body");
    expect(encryptText(once, "Note.body")).toBe(once);
  });

  it("will not encrypt without a valid 32-byte key", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    resetFieldKeyCache();
    expect(() => encryptText("x", "Note.body")).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("round trips JSON", () => {
    const value = [{ name: "Estradiol gel", category: "HRT" }];
    const stored = encryptJson(value, "ClinicalBrief.treatmentSummary");
    expect(JSON.stringify(stored)).not.toContain("Estradiol");
    expect(decryptJson(stored, "ClinicalBrief.treatmentSummary")).toEqual(value);
    expect(decryptJson(value, "ClinicalBrief.treatmentSummary")).toEqual(value);
  });

  it("encrypts and decrypts only the listed fields of a row, including { set } updates", () => {
    const row: Record<string, unknown> = {
      name: "Estradiol",
      notes: { set: "patch" },
      category: "HRT",
    };
    encryptRow("Treatment", row);
    expect(isEncrypted(row.name)).toBe(true);
    expect(isEncrypted((row.notes as { set: string }).set)).toBe(true);
    expect(row.category).toBe("HRT");

    const read = { name: row.name, notes: (row.notes as { set: string }).set, category: "HRT" };
    decryptRow("Treatment", read);
    expect(read).toEqual({ name: "Estradiol", notes: "patch", category: "HRT" });
  });

  it("leaves models without encrypted fields alone", () => {
    const row = { category: "HOT_FLASH", severity: "MILD" };
    encryptRow("ContextLog", row);
    expect(row).toEqual({ category: "HOT_FLASH", severity: "MILD" });
  });
});
