import { afterEach, beforeEach } from 'vitest';

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
});

afterEach(() => {
  process.env = { ...snapshot };
});
