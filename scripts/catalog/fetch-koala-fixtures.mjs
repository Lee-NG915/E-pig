/**
 * 从 Koala AU 公开 Shopify JSON 拉取展示用 mock。
 *
 * 单 collection 往往不足 20 条，故先拉 `/collections/all`，再按规则分桶到
 * E-pig category（每类最多 30）。
 *
 * 用法：node scripts/catalog/fetch-koala-fixtures.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = "https://au.koala.com";
const TARGET_PER_CATEGORY = 30;
const MIN_SOFT = 20;
const PAGE_LIMIT = 250;
const REQUEST_DELAY_MS = 400;
const OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../../src/adapters/commerce/mock/fixtures/koala/", import.meta.url),
);

/**
 * fixture 文件名（handle）→ E-pig category + 匹配规则。
 * prefer 先装；不足再用 fill 补到 TARGET。
 */
const CATEGORIES = [
  {
    handle: "sofas-couches",
    category: "Sofas",
    prefer: (product, tags) =>
      product.product_type === "Sofa" || tags.includes("sofas-couches") || tags.includes("modular-sofas"),
    fill: (product, tags) =>
      product.product_type === "Module" ||
      (product.product_type === "Ottoman" && tags.some((tag) => tag.includes("sofa"))),
  },
  {
    handle: "mattresses",
    category: "Mattresses",
    prefer: (product) => product.product_type === "Mattress",
    fill: (product) =>
      ["Mattress Protector", "Pillow", "Duvet"].includes(String(product.product_type)),
  },
  {
    handle: "sofa-beds",
    category: "Sofa Beds",
    prefer: (product) => product.product_type === "Sofa Bed",
    fill: (product, tags) => tags.includes("sofa-beds"),
  },
  {
    handle: "armchairs",
    category: "Armchairs",
    prefer: (product) => product.product_type === "Armchair",
    fill: (product, tags) => tags.includes("armchairs"),
  },
  {
    handle: "coffee-tables-side-tables",
    category: "Tables",
    prefer: (product) =>
      ["Coffee Table", "Side Table", "Bedside Table"].includes(String(product.product_type)),
    fill: (product, tags) =>
      tags.includes("coffee & side tables") || tags.includes("bedside tables"),
  },
  {
    handle: "outdoor-furniture",
    category: "Outdoor",
    prefer: (product) => String(product.product_type).startsWith("Outdoor"),
    fill: (product, tags) => tags.includes("outdoor-furniture") || tags.includes("outdoor range"),
  },
  {
    handle: "living-room",
    category: "Living Room",
    prefer: (product) =>
      ["Sofa Bed", "Armchair", "Ottoman", "Coffee Table", "Side Table", "Cushion"].includes(
        String(product.product_type),
      ),
    fill: (product, tags) => tags.includes("living-room") && product.product_type !== "Covers",
  },
  {
    handle: "bedroom",
    category: "Bedroom",
    prefer: (product) =>
      ["Mattress", "Bed Base", "Bedside Table", "Pillow", "Duvet", "Mattress Protector"].includes(
        String(product.product_type),
      ),
    fill: (product, tags) => tags.includes("bedroom") && product.product_type !== "Bundle",
  },
];

const BADGES = [
  { tags: ["bestseller", "bestsellers", "best seller"], label: "Bestseller" },
  { tags: ["new", "new-arrival", "new-arrivals", "new arrival", "new arrivals"], label: "New" },
  { tags: ["sale", "on sale"], label: "Sale" },
  { tags: ["limited edition", "limited"], label: "Limited edition" },
];

const MATERIALS = [
  ["Eucalyptus", /\beucalyptus\b/i],
  ["American oak", /\bamerican oak\b/i],
  ["Oak", /\boak\b/i],
  ["Plywood", /\bplywood\b/i],
  ["Timber", /\btimber\b/i],
  ["Steel", /\bsteel\b/i],
  ["Aluminium", /\balumini?um\b/i],
  ["Polyester", /\bpolyester\b/i],
  ["Linen", /\blinen\b/i],
  ["Cotton", /\bcotton\b/i],
  ["Wool", /\bwool\b/i],
  ["Leather", /\bleather\b/i],
  ["Foam", /\bfoam\b/i],
  ["Fabric", /\bfabric\b/i],
  ["Fibre", /\bfib(?:re|er)\b/i],
];

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function tagsOf(product) {
  if (Array.isArray(product.tags)) {
    return product.tags.map(String).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  }
  return String(product.tags ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code.startsWith("#")) {
      const hexadecimal = code[1].toLowerCase() === "x";
      const codePoint = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function descriptionOf(bodyHtml) {
  return decodeHtmlEntities(
    String(bodyHtml ?? "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function badgeOf(tags) {
  return BADGES.find(({ tags: candidates }) =>
    candidates.some((candidate) => tags.includes(candidate)),
  )?.label;
}

function colourOf(product) {
  const colourOption = product.options?.find(({ name }) => /^(colou?r)$/i.test(String(name).trim()));
  return String(colourOption?.values?.[0] ?? product.variants?.[0]?.option1 ?? "Default").trim() || "Default";
}

function materialsOf(description, tags) {
  const searchable = `${description} ${tags.join(" ")}`;
  return MATERIALS.filter(([, pattern]) => pattern.test(searchable)).map(([material]) => material);
}

function priceByMarket(au) {
  return {
    au,
    sg: Math.round(au * 0.88),
    us: Math.round(au * 0.72),
  };
}

function toFixture(product, collection, category, scrapedAt) {
  const variant = product.variants?.[0];
  const rawPrice = variant?.price;
  const auPrice = Math.round(Number(rawPrice));
  if (
    !product.handle ||
    !product.title ||
    rawPrice === undefined ||
    rawPrice === null ||
    rawPrice === "" ||
    !Number.isFinite(auPrice) ||
    auPrice <= 0
  ) {
    return null;
  }

  const image = String(product.images?.[0]?.src ?? "").trim();
  if (!image.startsWith("https://")) {
    return null;
  }

  const tags = tagsOf(product);
  const description = descriptionOf(product.body_html);
  const badge = badgeOf(tags);
  const compareAt = Number(variant?.compare_at_price);

  return {
    id: product.handle,
    slug: product.handle,
    name: product.title,
    category,
    ...(badge ? { badge } : {}),
    colour: colourOf(product),
    image,
    description,
    materials: materialsOf(description, tags),
    priceByMarket: priceByMarket(auPrice),
    ...(Number.isFinite(compareAt) && compareAt > 0
      ? { compareAtByMarket: priceByMarket(Math.round(compareAt)) }
      : {}),
    source: { vendor: "Koala", collection, scrapedAt },
  };
}

async function fetchAllProducts() {
  const products = [];
  for (let page = 1; page <= 4; page += 1) {
    const url = `${BASE_URL}/collections/all/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "E-pig-catalog-fixture-bot/1.0 (+local-dev)",
      },
    });
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const batch = Array.isArray(payload.products) ? payload.products : [];
    if (batch.length === 0) {
      break;
    }
    products.push(...batch);
    if (batch.length < PAGE_LIMIT) {
      break;
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return products;
}

function pickForCategory(allProducts, categoryConfig) {
  const preferred = [];
  const fillers = [];
  const seen = new Set();

  for (const product of allProducts) {
    if (!product.handle || seen.has(product.handle)) continue;
    const tags = tagsOf(product);
    if (categoryConfig.prefer(product, tags)) {
      preferred.push(product);
      seen.add(product.handle);
    }
  }

  for (const product of allProducts) {
    if (!product.handle || seen.has(product.handle)) continue;
    const tags = tagsOf(product);
    if (categoryConfig.fill?.(product, tags)) {
      fillers.push(product);
      seen.add(product.handle);
    }
  }

  return [...preferred, ...fillers].slice(0, TARGET_PER_CATEGORY);
}

function readmeOf(results, scrapedAt, catalogSize) {
  const resultRows = results
    .map(
      ({ handle, category, count, note }) =>
        `| \`${handle}\` | ${category} | ${count} | ${note ?? ""} |`,
    )
    .join("\n");

  return `# Koala catalog fixtures

更新日期：${scrapedAt.slice(0, 10)}

从 Koala Australia 公开 Shopify JSON（\`/collections/all/products.json\`，并参考 [sofas-couches](https://au.koala.com/collections/sofas-couches) 等集合语义）筛选的**展示用** mock。不登录、不抓整站 HTML、不下载图片。

拉取时全库约 **${catalogSize}** 条；再按类目规则分桶，每类最多 **${TARGET_PER_CATEGORY}**。公开目录若本身不足 ${MIN_SOFT} 条，会在 Note 标明（非脚本截断错误）。

## Collection results

| Fixture | E-pig category | Products | Note |
| --- | --- | ---: | --- |
${resultRows}

## 保留字段

handle/slug、name、category、badge、colour、首图 URL、纯文本 description（≤280）、粗材料、mock 多市场价格、source 元数据。不保留完整 variants / images / tags / HTML。

## 价格

- \`au\`：首个 variant 价格四舍五入
- \`sg\` / \`us\`：本地演示估算 \`Math.round(au * 0.88)\` / \`Math.round(au * 0.72)\`（非真实汇率）

## 重新生成

\`\`\`bash
node scripts/catalog/fetch-koala-fixtures.mjs
# 或：pnpm catalog:fetch-koala
\`\`\`
`;
}

async function main() {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const scrapedAt = process.env.KOALA_SCRAPED_AT ?? new Date().toISOString();

  console.log("Fetching /collections/all …");
  const allProducts = await fetchAllProducts();
  console.log(`Loaded ${allProducts.length} products from all`);

  const results = [];
  const usedHandles = new Set();

  for (const categoryConfig of CATEGORIES) {
    // 允许同一商品出现在多个浏览类目（Sofas vs Living Room）会重复 id —— mockProducts 合并时去重。
    // 这里每文件独立；catalog-data 合并时按 id 去重。
    const picked = pickForCategory(allProducts, categoryConfig);
    const fixtures = picked
      .map((product) => toFixture(product, categoryConfig.handle, categoryConfig.category, scrapedAt))
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const fixture of fixtures) {
      usedHandles.add(fixture.id);
    }

    const note =
      fixtures.length === 0
        ? "No matching products in public catalog"
        : fixtures.length < MIN_SOFT
          ? `Public catalog only has ${fixtures.length} matching products (< ${MIN_SOFT})`
          : null;

    await writeFile(
      path.join(OUTPUT_DIRECTORY, `${categoryConfig.handle}.json`),
      `${JSON.stringify(fixtures, null, 2)}\n`,
    );

    results.push({
      handle: categoryConfig.handle,
      category: categoryConfig.category,
      count: fixtures.length,
      note,
    });
    console.log(`${categoryConfig.handle}: ${fixtures.length}${note ? ` (${note})` : ""}`);
  }

  const counts = Object.fromEntries(results.map(({ handle, count }) => [handle, count]));
  const indexFixture = {
    generatedAt: scrapedAt,
    source: `${BASE_URL}/collections/all/products.json`,
    sourceCatalogSize: allProducts.length,
    uniqueHandlesWritten: usedHandles.size,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
  };

  await writeFile(path.join(OUTPUT_DIRECTORY, "index.json"), `${JSON.stringify(indexFixture, null, 2)}\n`);
  await writeFile(
    path.join(OUTPUT_DIRECTORY, "README.md"),
    readmeOf(results, scrapedAt, allProducts.length),
  );

  const populated = results.filter(({ count }) => count > 0).length;
  if (populated < 4) {
    throw new Error(`Only ${populated} categories contain products; four are required`);
  }

  console.log(`Done. rows=${indexFixture.total} uniqueHandles=${usedHandles.size}`);
}

await main();
