import { defineConfig } from 'vitest/config';

/**
 * Sondanın birim testleri kaynak dosyalarının SÖZLEŞMESİNİ okur; ölçüm
 * yüzeyi tarayıcı + Tauri IPC'ye bağlıdır ve gerçek kanıtı Deck'teki
 * koşudur. Bu yüzden paket quality.json'da gerekçeli muafiyet taşır —
 * kapsam eşiği burada bilerek yoktur (bkz. workspace-contract.mjs).
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
