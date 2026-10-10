import { i18next } from '../../i18n/I18n';
import { openActionDialog, type ActionDialogOptions } from './ActionDialog';

/** Kalıpların ortak seçenekleri; metinler çağıranındır, genel etiketler çevrilmiş varsayılandır. */
interface PatternBase {
  readonly container?: HTMLElement;
  readonly className?: string;
  /** Sahne kapanırken bekleyen diyaloğu iptal sonucuyla sonlandırır. */
  readonly signal?: AbortSignal;
}

function open(
  base: PatternBase,
  options: Omit<ActionDialogOptions, 'container' | 'className' | 'signal'>,
): Promise<string> {
  return openActionDialog({
    ...options,
    container: base.container,
    className: base.className,
    signal: base.signal,
  }).result;
}

export interface DestructiveConfirmOptions extends PatternBase {
  readonly title: string;
  readonly message?: string;
  /** Sonucun açık anlatımı; verilmezse çevrilmiş "Bu işlem geri alınamaz." */
  readonly consequence?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

/**
 * Yıkıcı işlem onayı. Onay `danger` varyantlıdır ve ilk odak İPTALdedir: yanlış Enter/A geri alınamaz işlem
 * yapmaz. Escape, scrim, geri tuşu ve sinyal `false` döndürür.
 */
export async function showDestructiveConfirm(options: DestructiveConfirmOptions): Promise<boolean> {
  const consequence = options.consequence ?? i18next.t('core:dialog.destructive.consequence');
  const picked = await open(options, {
    title: options.title,
    message: [options.message, consequence].filter(Boolean).join(' '),
    actions: [
      { id: 'cancel', label: options.cancelLabel ?? i18next.t('core:dialog.cancel') },
      {
        id: 'confirm',
        label: options.confirmLabel ?? i18next.t('core:dialog.destructive.confirm'),
        variant: 'danger',
      },
    ],
    cancelId: 'cancel',
  });
  return picked === 'confirm';
}

export type ExitChoice = 'save' | 'discard' | 'stay';

export interface ExitPromptOptions extends PatternBase {
  readonly title?: string;
  readonly message?: string;
  /**
   * Kaydetme işi. Verilirse "Kaydet ve çık" bekleme/hata/yeniden deneme durumlarından geçer; başarısızsa diyalog
   * açık kalır ve kullanıcı yine kaydetmeden çıkabilir ya da kalabilir.
   */
  readonly save?: (signal: AbortSignal) => void | PromiseLike<void>;
  readonly describeError?: (error: unknown) => string;
}

/**
 * Kaydedilmemiş değişiklikle çıkış: kaydet / kaydetme / vazgeç. Vazgeç iptaldir (Escape, scrim, geri) ve ilk odaktır;
 * "kaydetme" yıkıcıdır.
 */
export async function showExitPrompt(options: ExitPromptOptions = {}): Promise<ExitChoice> {
  const { save } = options;
  const picked = await open(options, {
    title: options.title ?? i18next.t('core:dialog.exit.title'),
    message: options.message ?? i18next.t('core:dialog.exit.message'),
    actions: [
      { id: 'save', label: i18next.t('core:dialog.exit.saveAndExit'), variant: 'primary' },
      { id: 'discard', label: i18next.t('core:dialog.exit.discardAndExit'), variant: 'danger' },
      { id: 'stay', label: i18next.t('core:dialog.exit.stay') },
    ],
    cancelId: 'stay',
    initialFocusId: 'stay',
    // Yalnız "kaydet" iş yapar; "kaydetme" doğrudan kapanır (vazgeç iptal eylemidir, onAction'a gelmez).
    onAction: save ? (id, signal) => (id === 'save' ? save(signal) : undefined) : undefined,
    describeError: options.describeError,
  });
  return picked as ExitChoice;
}

export type PermissionChoice = 'allow' | 'deny';

export interface PermissionPromptOptions extends PatternBase {
  readonly title: string;
  /** Neden istendiği; kullanıcıya gösterilen tek gerekçe, zorunludur. */
  readonly reason: string;
  readonly allowLabel?: string;
  readonly denyLabel?: string;
  /**
   * "İzin ver" seçilince çalışan gerçek istek (ör. platform izni). Verilirse bekleme/hata/yeniden deneme
   * durumlarından geçer; başarısızsa diyalog açık kalır ve "izin verme" ile çıkılabilir.
   */
  readonly request?: (signal: AbortSignal) => void | PromiseLike<void>;
  readonly describeError?: (error: unknown) => string;
}

/**
 * İzin istemi. Escape/scrim/geri/sinyal `deny` sayılır (kalıcı bir ret yazmak çağıranın kararıdır). Gerekçe
 * zorunludur: gerekçesiz çağrıda diyalog açılmaz ve söz reddedilir (programcı hatasıdır, kullanıcı akışı değil).
 */
export async function showPermissionPrompt(
  options: PermissionPromptOptions,
): Promise<PermissionChoice> {
  if (options.reason.trim() === '') throw new Error('İzin istemi gerekçe ister');
  const { request } = options;
  const picked = await open(options, {
    title: options.title,
    message: options.reason,
    actions: [
      {
        id: 'allow',
        label: options.allowLabel ?? i18next.t('core:dialog.permission.allow'),
        variant: 'primary',
      },
      { id: 'deny', label: options.denyLabel ?? i18next.t('core:dialog.permission.deny') },
    ],
    cancelId: 'deny',
    initialFocusId: 'deny',
    // `deny` iptal eylemidir ve onAction'a gelmez; buraya yalnız `allow` ulaşır.
    onAction: request ? (_id, signal) => request(signal) : undefined,
    describeError: options.describeError,
  });
  return picked as PermissionChoice;
}

export type SyncConflictChoice = 'local' | 'remote' | 'cancel';

/** Bir kopyanın kullanıcıya gösterilen özeti (ör. "12 Eki 2026 14:03 · 48 KB · Bölüm 7"). */
export interface SyncVersion {
  readonly label?: string;
  readonly summary: string;
}

export interface SyncConflictOptions extends PatternBase {
  readonly local: SyncVersion;
  readonly remote: SyncVersion;
  readonly title?: string;
  readonly message?: string;
  /**
   * Seçimi uygulayan gerçek iş. Bekleme sürerken yalnız İPTAL açıktır; hata sürerse seçim yeniden denenebilir.
   * Verilmezse seçim yalnızca bildirilir.
   */
  readonly resolve?: (choice: 'local' | 'remote', signal: AbortSignal) => void | PromiseLike<void>;
  readonly describeError?: (error: unknown) => string;
}

/**
 * Yerel–uzak kayıt çakışması: niyet (hangisi korunur, diğerine ne olur), bekleme, hata, yeniden deneme ve iptal
 * açıktır; ilk odak iptaldedir. Kopya adı nötr "uzak kopya"dır — bu kalıp bir bulut hizmetinin (ör. Steam
 * AutoCloud) çakışma ekranı DEĞİLDİR; hizmet adını çağıran `remote.label` ile kendisi koyar ve yalnız gerçekten
 * o hizmetse koymalıdır.
 */
export async function showSyncConflict(options: SyncConflictOptions): Promise<SyncConflictChoice> {
  const { resolve } = options;
  const picked = await open(options, {
    title: options.title ?? i18next.t('core:dialog.conflict.title'),
    message: options.message ?? i18next.t('core:dialog.conflict.message'),
    details: [
      {
        label: options.local.label ?? i18next.t('core:dialog.conflict.local'),
        value: options.local.summary,
      },
      {
        label: options.remote.label ?? i18next.t('core:dialog.conflict.remote'),
        value: options.remote.summary,
      },
    ],
    actions: [
      {
        id: 'local',
        label: i18next.t('core:dialog.conflict.keepLocal'),
        note: i18next.t('core:dialog.conflict.keepLocalNote'),
      },
      {
        id: 'remote',
        label: i18next.t('core:dialog.conflict.useRemote'),
        note: i18next.t('core:dialog.conflict.useRemoteNote'),
      },
      {
        id: 'cancel',
        label: i18next.t('core:dialog.cancel'),
        note: i18next.t('core:dialog.conflict.cancelNote'),
      },
    ],
    cancelId: 'cancel',
    initialFocusId: 'cancel',
    role: 'alertdialog',
    // `cancel` iptal eylemidir ve onAction'a gelmez; buraya yalnız `local`/`remote` ulaşır.
    onAction: resolve ? (id, signal) => resolve(id as 'local' | 'remote', signal) : undefined,
    describeError: options.describeError ?? (() => i18next.t('core:dialog.conflict.failed')),
  });
  return picked as SyncConflictChoice;
}
