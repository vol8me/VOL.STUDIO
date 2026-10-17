import type { Plugin } from 'vite';

/** Kanonik ses bank belgesinden çalışma zamanının okuduğu alanlara indirgenmiş görünüm. */
export declare function runtimeBankView(document: unknown): unknown;

/** `audio-banks/*.json` içe aktarmalarını çalışma zamanı görünümüne indirger. */
export declare function audioBankRuntime(): Plugin;
