"use client";

import { useSyncExternalStore } from "react";

/**
 * 浏览器 demo cart（README 已声明的有意决策）：
 * P0 无后端时按 market 保存在带版本的 localStorage；接后端后由 CartPort
 * adapter + 匿名 cart cookie（Server Action 签发，docs/07 §4）替换。
 */

export type DemoCartLine = {
  productId: string;
  name: string;
  colour: string;
  image: string;
  priceAmount: number;
  priceCurrency: string;
  quantity: number;
};

export type DemoCartProduct = {
  id: string;
  name: string;
  colour: string;
  image: string;
  price: { amount: number; currency: string };
};

export type CartMarketIdentity = {
  id: string;
  currency: string;
};

type CartState = {
  lines: DemoCartLine[];
  open: boolean;
};

type PersistedCart = {
  version: 1;
  marketId: string;
  lines: DemoCartLine[];
};

type MarketCartStore = {
  getSnapshot: () => CartState;
  subscribe: (listener: () => void) => () => void;
  update: (next: CartState) => void;
};

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "e-pig:demo-cart:v1";
const SERVER_SNAPSHOT: CartState = { lines: [], open: false };
const marketStores = new Map<string, { currency: string; store: MarketCartStore }>();

export function getCartStorageKey(marketId: string): string {
  return `${STORAGE_PREFIX}:${marketId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidLine(line: unknown, currency: string): line is DemoCartLine {
  if (typeof line !== "object" || line === null) return false;
  const candidate = line as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.productId) &&
    isNonEmptyString(candidate.name) &&
    typeof candidate.colour === "string" &&
    typeof candidate.image === "string" &&
    typeof candidate.priceAmount === "number" &&
    Number.isFinite(candidate.priceAmount) &&
    candidate.priceAmount >= 0 &&
    candidate.priceCurrency === currency &&
    Number.isInteger(candidate.quantity) &&
    (candidate.quantity as number) > 0
  );
}

function isPersistedCart(
  value: unknown,
  market: CartMarketIdentity,
): value is PersistedCart {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === STORAGE_VERSION &&
    candidate.marketId === market.id &&
    Array.isArray(candidate.lines) &&
    candidate.lines.every((line) => isValidLine(line, market.currency))
  );
}

function safelyRemoveStoredCart(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // 浏览器禁用 storage 时保持内存购物车可用。
  }
}

function createMarketStore(market: CartMarketIdentity): MarketCartStore {
  let state: CartState = SERVER_SNAPSHOT;
  let hydrated = false;
  const listeners = new Set<() => void>();
  const storageKey = getCartStorageKey(market.id);

  function hydrate() {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (!isPersistedCart(parsed, market)) {
        safelyRemoveStoredCart(storageKey);
        return;
      }
      state = { ...state, lines: parsed.lines };
    } catch {
      safelyRemoveStoredCart(storageKey);
    }
  }

  function persist(lines: DemoCartLine[]) {
    if (typeof window === "undefined") return;
    const payload: PersistedCart = { version: STORAGE_VERSION, marketId: market.id, lines };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Quota/private-mode 错误不应让当前页面的内存购物车失效。
    }
  }

  function emit() {
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot() {
      hydrate();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      hydrate();
      return () => listeners.delete(listener);
    },
    update(next) {
      state = next;
      persist(next.lines);
      emit();
    },
  };
}

function getMarketStore(market: CartMarketIdentity): MarketCartStore {
  const existing = marketStores.get(market.id);
  if (existing) {
    if (existing.currency !== market.currency) {
      throw new Error(`Market ${market.id} changed currency during the current session`);
    }
    return existing.store;
  }

  const store = createMarketStore(market);
  marketStores.set(market.id, { currency: market.currency, store });
  return store;
}

export function getCartSnapshot(market: CartMarketIdentity): CartState {
  return getMarketStore(market).getSnapshot();
}

export function addItem(market: CartMarketIdentity, product: DemoCartProduct) {
  if (product.price.currency !== market.currency) {
    throw new Error(
      `Product currency ${product.price.currency} does not match market currency ${market.currency}`,
    );
  }

  const store = getMarketStore(market);
  const current = store.getSnapshot();
  const existing = current.lines.find((line) => line.productId === product.id);
  const lines = existing
    ? current.lines.map((line) =>
        line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
      )
    : [
        ...current.lines,
        {
          productId: product.id,
          name: product.name,
          colour: product.colour,
          image: product.image,
          priceAmount: product.price.amount,
          priceCurrency: product.price.currency,
          quantity: 1,
        },
      ];

  store.update({ lines, open: true });
}

export function setQuantity(
  market: CartMarketIdentity,
  productId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity)) throw new Error("Cart quantity must be an integer");
  const store = getMarketStore(market);
  const current = store.getSnapshot();
  const lines = current.lines
    .map((line) => (line.productId === productId ? { ...line, quantity } : line))
    .filter((line) => line.quantity > 0);
  store.update({ ...current, lines });
}

export function setCartOpen(market: CartMarketIdentity, open: boolean) {
  const store = getMarketStore(market);
  const current = store.getSnapshot();
  store.update({ ...current, open });
}

export function useCartStore(market: CartMarketIdentity) {
  const store = getMarketStore(market);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);
}
