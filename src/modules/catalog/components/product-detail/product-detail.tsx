"use client";

import { useState } from "react";

import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  ShoppingCart,
  Star,
} from "lucide-react";

import type {
  ProductColourOption,
  ProductDetail as ProductDetailData,
  ProductGalleryImage,
} from "@/core/contracts/commerce/catalog";

import {
  useCartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
import { addItem } from "@/modules/cart/lib/cart-store";
import { formatMarketPrice } from "@/platform/config/format-market-price";

type ProductDetailProps = {
  product: ProductDetailData;
};

function Gallery({ product }: ProductDetailProps) {
  const gallery: ProductGalleryImage[] = product.gallery.length
    ? product.gallery
    : [{ src: product.image, alt: product.name }];
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = gallery[activeIndex] ?? gallery[0];

  function move(delta: number) {
    setActiveIndex((current) => (current + delta + gallery.length) % gallery.length);
  }

  return (
    <div className="h-[394px] w-full overflow-hidden lg:h-[550px] lg:w-[510px]">
      <div className="relative h-[277px] overflow-hidden rounded-[5px] bg-[#f3f3f3] lg:h-[450px] lg:w-[506px]">
        <Image
          key={activeImage.src}
          src={activeImage.src}
          alt={activeImage.alt}
          fill
          sizes="(min-width: 1024px) 506px, 100vw"
          className="object-cover"
          priority
        />
        {gallery.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous product image"
              className="absolute left-8 top-1/2 -translate-y-1/2 rounded-full p-2 text-white transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:left-8"
            >
              <ChevronLeft className="size-10 stroke-[1.5]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="Next product image"
              className="absolute right-8 top-1/2 -translate-y-1/2 rounded-full p-2 text-white transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:right-8"
            >
              <ChevronRight className="size-10 stroke-[1.5]" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
      <div className="mt-10 flex gap-[19px] overflow-x-auto lg:mt-5">
        {gallery.map((image, index) => (
          <button
            key={`${image.src}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`Show product image ${index + 1}`}
            aria-pressed={activeIndex === index}
            className={`relative h-[75px] w-[100px] shrink-0 overflow-hidden rounded-[2px] bg-[#f3f3f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a6f0] ${activeIndex === index ? "" : "opacity-50"}`}
          >
            <Image
              src={image.src}
              alt=""
              fill
              sizes="100px"
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function Rating({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  return (
    <div className="flex items-center gap-[10px]" aria-label={`${rating} out of 5 stars, ${reviewCount} reviews`}>
      <div className="flex gap-[5px]" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => {
          const filled = index < Math.floor(rating);
          return (
            <Star
              key={index}
              className="size-[22px] stroke-[#f3cd03]"
              fill={filled ? "#f3cd03" : "transparent"}
              strokeWidth={filled ? 1.5 : 2}
            />
          );
        })}
      </div>
      <span className="text-[14px] font-bold leading-6 tracking-[0.2px] text-[#737373]">
        {reviewCount} Reviews
      </span>
    </div>
  );
}

function ColourOptions({
  options,
  selectedId,
  onSelect,
}: {
  options: ProductColourOption[];
  selectedId: string | null;
  onSelect: (option: ProductColourOption) => void;
}) {
  return (
    <div className="flex gap-[10px]" role="radiogroup" aria-label="Colour options">
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onClick={() => onSelect(option)}
            className={`size-[30px] rounded-full border-2 border-transparent p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a6f0] focus-visible:ring-offset-2 ${selected ? "border-[#252b42]" : ""}`}
          >
            <span
              className="block size-full rounded-full"
              style={{ backgroundColor: option.swatch }}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

export function ProductDetail({ product }: ProductDetailProps) {
  const market = useCartMarket();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectedColourId, setSelectedColourId] = useState<string | null>(null);
  const selectedColour = product.colourOptions.find(
    (option) => option.id === selectedColourId,
  );
  const inStock = product.availability === "in-stock";

  function handlePrimaryAction() {
    if (!inStock) return;
    if (!optionsOpen) {
      setOptionsOpen(true);
      return;
    }
    if (!selectedColour) return;
    addItem(market, {
      id: product.id,
      name: product.name,
      colour: selectedColour.label,
      image: product.image,
      price: product.price,
    });
  }

  return (
    <section className="bg-[#fafafa]" aria-labelledby="product-detail-title">
      <div className="mx-auto flex w-full max-w-[348px] flex-col gap-[30px] overflow-hidden pb-12 pt-12 lg:max-w-[1050px] lg:flex-row lg:items-start">
        <Gallery product={product} />

        <div className="relative h-[471px] w-full overflow-hidden px-6 lg:w-[510px]">
          <h1
            id="product-detail-title"
            className="text-[20px] font-normal leading-[30px] tracking-[0.2px] text-[#252b42]"
          >
            {product.name}
          </h1>

          <div className="mt-3">
            <Rating rating={product.rating} reviewCount={product.reviewCount} />
          </div>

          <p className="mt-5 text-[24px] font-bold leading-8 tracking-[0.1px] text-[#252b42]">
            {formatMarketPrice(product.price, market.id)}
          </p>

          <p className="mt-1 flex gap-[5px] text-[14px] font-bold leading-6 tracking-[0.2px]">
            <span className="text-[#737373]">Availability&nbsp; :</span>
            <span className={inStock ? "text-[#23a6f0]" : "text-[#e77c40]"}>
              {inStock ? "In Stock" : "Out of Stock"}
            </span>
          </p>

          <p className="mt-7 line-clamp-5 max-w-[464px] text-[14px] font-normal leading-5 tracking-[0.2px] text-[#858585] lg:line-clamp-3">
            {product.description}
          </p>

          <div className="mt-6 h-px w-full bg-[#bdbdbd] lg:mt-6" aria-hidden="true" />

          <div className="mt-6 lg:mt-7">
            <ColourOptions
              options={product.colourOptions}
              selectedId={selectedColourId}
              onSelect={(option) => {
                setSelectedColourId(option.id);
                setOptionsOpen(true);
              }}
            />
            <p className="sr-only" aria-live="polite">
              {optionsOpen
                ? selectedColour
                  ? `${selectedColour.label} selected. Choose Add to bag to continue.`
                  : "Choose a colour to continue."
                : "Colour options are available."}
            </p>
          </div>

          <div className="absolute bottom-6 left-6 flex items-start gap-[10px]">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={!inStock || (optionsOpen && !selectedColour)}
              className="h-11 rounded-[5px] bg-[#23a6f0] px-5 text-[14px] font-bold leading-6 tracking-[0.2px] text-white transition-colors hover:bg-[#1d93d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a6f0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!optionsOpen ? "Select Options" : "Add to bag"}
            </button>
            <button
              type="button"
              aria-label="Add product to wishlist"
              title="Wishlist"
              className="size-10 rounded-full border border-[#e8e8e8] bg-white text-[#252b42] transition-colors hover:bg-[#f7f7f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a6f0] focus-visible:ring-offset-2"
            >
              <Heart className="mx-auto size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Add product to basket"
              title="Basket"
              className="size-10 rounded-full border border-[#e8e8e8] bg-white text-[#252b42] transition-colors hover:bg-[#f7f7f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a6f0] focus-visible:ring-offset-2"
            >
              <ShoppingCart className="mx-auto size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Preview product"
              title="Preview"
              className="size-10 rounded-full border border-[#e8e8e8] bg-white text-[#252b42] transition-colors hover:bg-[#f7f7f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a6f0] focus-visible:ring-offset-2"
            >
              <Eye className="mx-auto size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
