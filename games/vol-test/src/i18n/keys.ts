import type { ParseKeys } from 'i18next';

/** Oyunun `voltest` ad alanındaki çeviri anahtarı (`voltest:` önekiyle); yazım hatası derlemede düşer. */
export type MessageKey = Extract<ParseKeys<['voltest']>, `voltest:${string}`>;
