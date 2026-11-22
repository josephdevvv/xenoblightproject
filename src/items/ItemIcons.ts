import { GameServices } from '../systems/GameServices';
import { ITEM_CATALOG, itemIconKey } from './ItemCatalog';

/** Loads every item icon texture (once). A missing icon is reported and skipped. */
export async function loadItemIcons(): Promise<void> {
  const services = await GameServices.ready();
  await Promise.all(
    [...ITEM_CATALOG.values()].map(({ id, icon }) =>
      services.assets.load({ key: itemIconKey(id), type: 'image', url: icon.url }).catch((e: Error) => console.warn(`[items] ${id}: ${e.message}`)),
    ),
  );
}
