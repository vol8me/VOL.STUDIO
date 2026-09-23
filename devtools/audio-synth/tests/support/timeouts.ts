/**
 * Ağır testlerin süre sınırları — gerekçe TEK yerde. Kapsam ölçümü (v8 +
 * AST yeniden eşleme) sentezi ölçülen olarak ~4.5 kat yavaşlatır; kapsamsız
 * birkaç saniye süren render ya da yayın testi 5 saniyelik varsayılanı aşar.
 * Global `testTimeout` BÜYÜTÜLMEZ: başka testlerdeki gerçek bir takılmayı
 * gizlerdi. Sınır yalnız gerçekten ağır olan teste ya da her testi render
 * eden bloğa verilir.
 */

/** Süreç içi ses render'ı ya da tek bir alt süreç. */
export const RENDER_TIMEOUT = 60_000;

/** Kodlama + çözme içeren yayın hattı, birden çok süreç ya da çok aşamalı üretim. */
export const PIPELINE_TIMEOUT = 120_000;

export const RENDER_BLOCK = { timeout: RENDER_TIMEOUT } as const;
export const PIPELINE_BLOCK = { timeout: PIPELINE_TIMEOUT } as const;
