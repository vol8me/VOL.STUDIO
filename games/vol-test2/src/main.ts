// WebSocket kabuğu İLK içe aktarılır: Colyseus SDK `WebSocket`i modül yüklenirken önbelleğe alır.
import './net/installWebSocketShim';
import '@volstudio/core/ui/styles.css';
import { showFatalStartupError } from '@volstudio/core';
import { boot } from './bootstrap/boot';
import tr from './i18n/tr.json';
import './i18n/i18next-augment';
import './style.css';

void boot().catch((error: unknown) => showFatalStartupError({ title: tr.app.fatal, error }));
