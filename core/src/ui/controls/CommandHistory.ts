export interface HistoryCommand {
  label: string;
  /** Undo verisinin yaklaşık bellek maliyeti; negatif/NaN kabul edilmez. */
  byteCost: number;
  apply(): void;
  revert(): void;
  mergeKey?: string;
  /** Ardışık gesture'ları tek adıma indirmek isteyen komutlar için. */
  mergeWith?(next: HistoryCommand): HistoryCommand | null;
}

export interface CommandHistorySnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  byteCost: number;
  undoCount: number;
  redoCount: number;
}

export interface CommandHistoryOptions {
  maxBytes?: number;
  onChange?: (snapshot: CommandHistorySnapshot) => void;
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

function validateHistoryCommand(command: HistoryCommand): void {
  if (!command.label) throw new Error('HistoryCommand.label boş olamaz');
  if (!Number.isFinite(command.byteCost) || command.byteCost < 0) {
    throw new Error('HistoryCommand.byteCost sonlu ve negatif olmayan bir sayı olmalıdır');
  }
}

/** Byte bütçeli, transaction destekli genel undo/redo mekanizması. */
export class CommandHistory {
  private readonly maxBytes: number;
  private readonly onChangeHandler?: (snapshot: CommandHistorySnapshot) => void;
  private readonly past: HistoryCommand[] = [];
  private readonly future: HistoryCommand[] = [];
  private totalBytes = 0;
  private activeTransaction: CommandTransaction | null = null;

  constructor(options: CommandHistoryOptions = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new Error('CommandHistory.maxBytes sonlu ve negatif olmayan bir sayı olmalıdır');
    }
    this.maxBytes = maxBytes;
    this.onChangeHandler = options.onChange;
  }

  /** Komutu uygular ve geçmişe kaydeder. */
  execute(command: HistoryCommand): void {
    validateHistoryCommand(command);
    if (this.activeTransaction) {
      this.activeTransaction.execute(command);
      return;
    }
    command.apply();
    this.acceptApplied(command);
  }

  /** Zaten uygulanmış bir komutu geçmişe kaydeder. */
  record(command: HistoryCommand): void {
    validateHistoryCommand(command);
    if (this.activeTransaction) {
      this.activeTransaction.record(command);
      return;
    }
    this.acceptApplied(command);
  }

  beginTransaction(label: string): CommandTransaction {
    if (this.activeTransaction) throw new Error('İç içe CommandHistory transaction desteklenmez');
    const transaction = new CommandTransaction(this, label);
    this.activeTransaction = transaction;
    return transaction;
  }

  runTransaction(label: string, run: (transaction: CommandTransaction) => void): void {
    const transaction = this.beginTransaction(label);
    try {
      run(transaction);
      transaction.commit();
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): boolean {
    this.assertNoTransaction();
    const command = this.past.at(-1);
    if (!command) return false;
    command.revert();
    this.past.pop();
    this.totalBytes -= command.byteCost;
    this.future.push(command);
    this.emitChange();
    return true;
  }

  redo(): boolean {
    this.assertNoTransaction();
    const command = this.future.at(-1);
    if (!command) return false;
    command.apply();
    this.future.pop();
    this.past.push(command);
    this.totalBytes += command.byteCost;
    this.emitChange();
    return true;
  }

  clear(): void {
    this.assertNoTransaction();
    this.past.length = 0;
    this.future.length = 0;
    this.totalBytes = 0;
    this.emitChange();
  }

  getSnapshot(): CommandHistorySnapshot {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoLabel: this.past.at(-1)?.label,
      redoLabel: this.future.at(-1)?.label,
      byteCost: this.totalBytes,
      undoCount: this.past.length,
      redoCount: this.future.length,
    };
  }

  /** Yalnız `CommandTransaction` tarafından çağrılır. */
  finishTransaction(transaction: CommandTransaction, commands: readonly HistoryCommand[]): void {
    if (this.activeTransaction !== transaction) throw new Error('Transaction artık aktif değil');
    this.activeTransaction = null;
    if (commands.length === 0) return;
    this.acceptApplied(this.composite(transaction.label, commands));
  }

  /** Yalnız `CommandTransaction` tarafından çağrılır. */
  abandonTransaction(transaction: CommandTransaction): void {
    if (this.activeTransaction === transaction) this.activeTransaction = null;
  }

  private acceptApplied(command: HistoryCommand): void {
    this.future.length = 0;
    const previous = this.past.at(-1);
    const merged =
      previous?.mergeKey && previous.mergeKey === command.mergeKey
        ? previous.mergeWith?.(command) ?? null
        : null;
    if (merged) {
      validateHistoryCommand(merged);
      this.past.pop();
      this.totalBytes -= previous?.byteCost ?? 0;
      command = merged;
    }

    if (command.byteCost <= this.maxBytes) {
      this.past.push(command);
      this.totalBytes += command.byteCost;
      while (this.totalBytes > this.maxBytes && this.past.length > 0) {
        const discarded = this.past.shift();
        if (discarded) this.totalBytes -= discarded.byteCost;
      }
    } else {
      // Komut tek başına bütçeye sığmıyor: belgeye uygulandı ama saklanamaz.
      // Eski girdiler bırakılırsa geçmiş belgeden AYRIŞIR — undo, aslında
      // uygulanmış devasa değişikliği değil ondan önceki komutu geri alır ve
      // belge hiç var olmamış bir duruma düşerdi. Bu noktadan geriye hiçbir
      // undo geçerli olmadığı için yığın tümüyle bırakılır.
      this.past.length = 0;
      this.totalBytes = 0;
    }
    this.emitChange();
  }

  private composite(label: string, commands: readonly HistoryCommand[]): HistoryCommand {
    const frozen = [...commands];
    return {
      label,
      byteCost: frozen.reduce((sum, command) => sum + command.byteCost, 0),
      apply: () => {
        for (const command of frozen) command.apply();
      },
      revert: () => {
        for (let index = frozen.length - 1; index >= 0; index--) frozen[index].revert();
      },
    };
  }

  private assertNoTransaction(): void {
    if (this.activeTransaction) throw new Error('Aktif transaction varken geçmiş değiştirilemez');
  }

  private emitChange(): void {
    this.onChangeHandler?.(this.getSnapshot());
  }
}

export class CommandTransaction {
  readonly label: string;
  private readonly history: CommandHistory;
  private readonly commands: HistoryCommand[] = [];
  private closed = false;

  constructor(history: CommandHistory, label: string) {
    if (!label) throw new Error('CommandTransaction.label boş olamaz');
    this.history = history;
    this.label = label;
  }

  execute(command: HistoryCommand): void {
    this.assertOpen();
    validateHistoryCommand(command);
    command.apply();
    this.commands.push(command);
  }

  record(command: HistoryCommand): void {
    this.assertOpen();
    validateHistoryCommand(command);
    this.commands.push(command);
  }

  commit(): void {
    this.assertOpen();
    this.closed = true;
    this.history.finishTransaction(this, this.commands);
  }

  rollback(): void {
    if (this.closed) return;
    this.closed = true;
    let firstError: unknown;
    for (let index = this.commands.length - 1; index >= 0; index--) {
      try {
        this.commands[index].revert();
      } catch (error) {
        firstError ??= error;
      }
    }
    this.history.abandonTransaction(this);
    if (firstError instanceof Error) throw firstError;
    if (firstError !== undefined) {
      throw new Error(typeof firstError === 'string' ? firstError : 'Command rollback başarısız');
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('CommandTransaction zaten kapatıldı');
  }
}
