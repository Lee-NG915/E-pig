/**
 * CatalogPort（04 §5）：商品/集合的只读契约。
 * module 只依赖这里的类型与接口；具体实现由 adapters/commerce/* 提供。
 * DTO 只含内部语义，不得出现供应商字段（blok、handle vs id 等由 adapter 映射）。
 */

export type Money = {
  /** 最小单位之上的主单位金额（如 2890 表示 AUD 2,890.00） */
  amount: number;
  /** ISO 4217 */
  currency: string;
};

export type ProductListItem = {
  id: string;
  name: string;
  category: string;
  price: Money;
  compareAt?: Money;
  badge?: string;
  colour: string;
  image: string;
};

export type ProductDetail = ProductListItem & {
  description?: string;
  materials?: string[];
};

export type Collection = {
  handle: string;
  title: string;
};

export type ListProductsQuery = {
  category?: string;
  limit?: number;
};

export interface CatalogPort {
  listProducts(query?: ListProductsQuery): Promise<ProductListItem[]>;
  /** 未找到时抛 AppError({ kind: "not_found" })，不返回 null —— UI 只处理 typed error */
  getProduct(id: string): Promise<ProductDetail>;
  listCollections(): Promise<Collection[]>;
  suggest(query: string): Promise<ProductListItem[]>;
}
