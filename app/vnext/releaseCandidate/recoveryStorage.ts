/** A stale open view must not overwrite or remove another view's recovery. */
export class RecoveryStorageConflict extends Error {
  constructor(message = "This training changed in another open view. Keep that view open and reload this one before continuing. Its newer saved progress has not been replaced.") {
    super(message);
    this.name = "RecoveryStorageConflict";
  }
}

export const createRecoveryStorageGuard = (
  key: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage,
) => {
  let initialValue: string | null = null;
  let unreadable = false;
  try { initialValue = storage.getItem(key); }
  catch { unreadable = true; }
  let expected = initialValue;
  const assertCurrent = (): void => {
    if (unreadable) throw new RecoveryStorageConflict("Saved training could not be read on this device. Keep your other training view open and reload this view before continuing.");
    if (storage.getItem(key) !== expected) throw new RecoveryStorageConflict();
  };
  return {
    key,
    initialValue,
    assertCurrent,
    write(value: string): void {
      assertCurrent();
      storage.setItem(key, value);
      expected = value;
    },
    remove(): void {
      assertCurrent();
      storage.removeItem(key);
      expected = null;
    },
  };
};
