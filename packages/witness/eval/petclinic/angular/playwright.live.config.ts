// Live specs (e2e-live/) against the web and REST services witness started.
import path from 'node:path';
import base from './playwright.config';

export default {
  ...base,
  testDir: path.join(__dirname, '..', 'e2e-live'),
  testMatch: '**/*.spec.ts',
};
