import { installWebSocketShim } from './webSocketShim';

/**
 * Colyseus SDK `WebSocket`i modül yüklenirken bir kez okuyup saklar; sarmalayıcı bundan ÖNCE kurulmalı.
 * Bu dosya `main.ts`te SDK'yı çeken her içe aktarmadan önce, en başta içe aktarılır (modüller içe aktarma
 * sırasıyla çalışır).
 */
installWebSocketShim();
