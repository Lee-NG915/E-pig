"use client";

import { useSyncExternalStore } from "react";

/**
 * 浏览器 demo cart（README 已声明的有意决策）：
 * P0 无后端时保存在 localStorage；接后端后由 CartPort adapter + 匿名 cart
 * cookie（Server Action 签发，docs/07 §4）替换，UI 职责不变。
 *
 * line 在加入时存快照（名称/价格/图片），展示不再回查 catalog ——
 * 与真实 cart API 返回 line 明细的行为一致。
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

/** 与 ProductListItem 结构兼容（结构类型即可，不 import catalog 模块）。 */
export type DemoCartProduct = {
  id: string;
  name: string;
  colour: string;
  image: string;
  price: { amount: number; currency: string };
};

type CartState = {
  lines: DemoCartLine[];
  open: boolean;
};

const STORAGE_KEY = "e-pig:demo-cart";
const SERVER_SNAPSHOT: CartState = { lines: [], open: false };

let state: CartState = SERVER_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function isValidLine(line: unknown): line is DemoCartLine {
  if (typeof line !== "object" || line === null) return false;
  const candidate = line as Record<string, unknown>;
  return (
    typeof candidate.productId === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.priceAmount === "number" &&
    typeof candidate.priceCurrency === "string" &&
    typeof candidate.quantity === "number"
  );
}

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    const lines = Array.isArray(parsed) ? parsed.filter(isValidLine) : [];
    state = { ...state, lines };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function persist(lines: DemoCartLine[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }
}

function update(next: CartState) {
  state = next;
  persist(next.lines);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  hydrateFromStorage();
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** 组件外（测试、未来的 Server Action 桥）读取当前快照用。 */
export function getCartSnapshot(): CartState {
  return getSnapshot();
}

export function addItem(product: DemoCartProduct) {
  hydrateFromStorage();
  const existing = state.lines.find((line) => line.productId === product.id);
  const lines = existing
    ? state.lines.map((line) =>
        line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
      )
    : [
        ...state.lines,
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

  update({ lines, open: true });
}

export function setQuantity(productId: string, quantity: number) {
  const lines = state.lines
    .map((line) => (line.productId === productId ? { ...line, quantity } : line))
    .filter((line) => line.quantity > 0);
  update({ ...state, lines });
}

export function setCartOpen(open: boolean) {
  state = { ...state, open };
  emit();
}

export function useCartStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
