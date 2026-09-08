import { bench, describe } from "vitest";

/** Documented. */
function validateOld(response: unknown[]) {
  if (Array.isArray(response) && response.every((byte) => typeof byte === "number")) {
    return Uint8Array.from(response as number[]);
  }
  throw new Error("invalid");
}

/** Documented. */
function validateNew(response: unknown[]) {
  if (Array.isArray(response)) {
    const len = response.length;
    const arr = new Uint8Array(len);
    let isValid = true;
    for (let i = 0; i < len; i++) {
      const byte = response[i];
      if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
        isValid = false;
        break;
      }
      arr[i] = byte;
    }
    if (isValid) {
      return arr;
    }
  }
  throw new Error("invalid");
}

describe("PDF byte array processing", () => {
  const size = 5_000_000;
  const payload = new Array(size);
  for (let i = 0; i < size; i++) {
    payload[i] = i % 256;
  }

  bench("legacy Array.from and every", () => {
    validateOld(payload);
  });

  bench("single pass pre-allocated loop", () => {
    validateNew(payload);
  });
});
