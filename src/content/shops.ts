// The first shop is Matsushimaya. All prices and the interior are fictional
// game content, never a real offer (docs/ARCHITECTURE.md §2, §6).
import type { ShopCatalog } from '../contracts';
import { ITEM, SHOP } from '../contracts';
import { SHOP_NODES } from './dialogue';

export interface ShopDefinition extends ShopCatalog {
  /** Dialogue node that is open while a purchase is legal. */
  orderNodeId: string;
  /** Node entered after a successful purchase. */
  confirmNodeId: string;
  /** The mission asks for this quantity; other quantities re-ask. */
  requiredQuantity: number;
}

export const SHOPS: Record<string, ShopDefinition> = {
  [SHOP.matsushimaya]: {
    shopId: SHOP.matsushimaya,
    orderNodeId: SHOP_NODES.order,
    confirmNodeId: SHOP_NODES.confirm,
    requiredQuantity: 2,
    items: [{ itemId: ITEM.mochi, priceYen: 300, fictionalPrice: true, maxQuantity: 5 }],
  },
};
