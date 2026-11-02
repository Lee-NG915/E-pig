import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { CartSheetMount } from "@/modules/cart/components/cart-sheet-mount/cart-sheet-mount";
import { HelpContent, isHelpTopic } from "@/modules/content/components/help-content/help-content";
import { SiteHeader } from "@/modules/content/components/site-header/site-header";
import { SiteFooter } from "@/modules/content/components/site-footer/site-footer";
import { isMarketId } from "@/platform/config/markets";
import { getCapabilities } from "@/platform/registry";
type Props = { params: Promise<{ market: string; slug: string }> };
async function Chrome() { await connection(); const { market } = getCapabilities(); return <CartSheetMount market={market}><SiteHeader /></CartSheetMount>; }
async function Content({ params }: Props) { const { market: marketId, slug } = await params; await connection(); const { market } = getCapabilities(); if (!isMarketId(marketId) || marketId !== market.id || !isHelpTopic(slug)) notFound(); return <HelpContent marketId={market.id} topic={slug} />; }
export default function HelpPage(props: Props) { return <div className="min-h-screen"><Suspense fallback={<div className="h-24 border-b" />}><Chrome /></Suspense><main><Suspense fallback={<p role="status" className="p-8">Loading help…</p>}><Content {...props} /></Suspense></main><SiteFooter /></div>; }
