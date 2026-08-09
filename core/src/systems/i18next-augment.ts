import type coreTr from '../i18n/tr.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'core';
    strictKeyChecks: true;
    resources: {
      core: typeof coreTr;
    };
  }
}
