// The repo's Playwright config, pointed at the web service witness started (WITNESS_WEB_URL) instead of a webServer on fixed port 4200.
import path from 'node:path';
import base from '../playwright.config';

const { webServer: _ignored, ...rest } = base;
export default {
  ...rest,
  testDir: path.join(__dirname, '..', 'e2e'),
  outputDir: path.join(__dirname, 'scratch', 'test-results'),
  use: {
    ...base.use,
    baseURL: process.env.WITNESS_WEB_URL ?? 'http://127.0.0.1:4200',
    screenshot: process.env.WITNESS_EVIDENCE ? 'on' : 'off',
    video: process.env.WITNESS_EVIDENCE ? 'on' : 'off',
  },
};
