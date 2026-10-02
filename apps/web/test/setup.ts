import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// The sign up form is under test; its closed state has its own test.
process.env.NEXT_PUBLIC_REGISTRATION_OPEN ??= "true";

afterEach(() => {
  cleanup();
});
