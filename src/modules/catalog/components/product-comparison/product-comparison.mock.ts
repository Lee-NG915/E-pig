import type { ProductDetail } from "@/core/contracts/commerce/catalog";

export const comparisonProduct: ProductDetail = {
  id: "alto", slug: "alto-sofa", name: "Alto Sofa", category: "Sofas", colour: "Green",
  image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=85",
  price: { amount: 2600, currency: "AUD" }, description: "Sample sofa", materials: ["Fabric", "Timber"], gallery: [], colourOptions: [], availability: "in-stock",
  variants: [
    { id: "green:wide", sku: "DEMO-GREEN", label: "Green / Wide", price: { amount: 2600, currency: "AUD" }, image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=85", availability: "in-stock", maxQuantity: 5, options: [{ name: "Colour", value: "Green" }], dimensions: { width: 210, depth: 90, height: 80, unit: "cm" } },
    { id: "cream / small", sku: "DEMO-CREAM", label: "Cream / Small", price: { amount: 2200, currency: "AUD" }, image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=85", availability: "out-of-stock", maxQuantity: 0 },
  ],
};

export const secondComparisonProduct: ProductDetail = {
  ...comparisonProduct, id: "bed", slug: "bed", name: "Harbour Bed", materials: [],
  variants: [{ ...comparisonProduct.variants[0], id: "bed-default", label: "Queen", dimensions: undefined, options: undefined }],
};
