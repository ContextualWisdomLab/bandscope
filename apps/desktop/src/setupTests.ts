import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// Mock DOMPurify to fix test failures where DOMPurify is undefined globally in tests
import DOMPurify from 'dompurify';
vi.stubGlobal('DOMPurify', DOMPurify);
