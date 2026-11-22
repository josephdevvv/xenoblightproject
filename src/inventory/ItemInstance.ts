/**
 * Identity of single items. Every piece of equipment is its own INSTANCE: two copies of the same item
 * (`itemId`) have different `instanceId`s and are never merged. `options` is reserved for future equipment
 * options / affixes: nothing creates or reads them yet, they are only carried along unchanged.
 */
export type ItemOptions = Readonly<Record<string, unknown>>;

export interface ItemInstance {
  readonly itemId: string;
  readonly instanceId: string;
  readonly options?: ItemOptions;
}

/** What lies in a bag slot: one instance (equipment), or a number of identical stackable items (no identity). */
export interface ItemStack {
  readonly itemId: string;
  readonly quantity: number;
  readonly instanceId?: string;
  readonly options?: ItemOptions;
}

/** A new, unique instance id. */
export function newInstanceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return `item_${c.randomUUID()}`;
  const random = (): string => Math.random().toString(36).slice(2, 10);
  return `item_${Date.now().toString(36)}_${random()}${random()}`;
}

/** The instance as it lies in the bag. */
export function instanceToStack(i: ItemInstance): ItemStack {
  return { itemId: i.itemId, quantity: 1, instanceId: i.instanceId, ...(i.options ? { options: i.options } : {}) };
}

/** A single bag item as an instance (an item without an identity gets one). */
export function stackToInstance(s: ItemStack, newId: () => string = newInstanceId): ItemInstance {
  return { itemId: s.itemId, instanceId: s.instanceId ?? newId(), ...(s.options ? { options: s.options } : {}) };
}

/** Stored option data is kept as it is when it has the right shape. */
export function readOptions(raw: unknown): ItemOptions | undefined {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as ItemOptions) : undefined;
}
