import { marketDataAdapter } from "@/lib/market-data/adapter";
import { parseCandleInterval } from "@/lib/market-data/intervals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const interval = parseCandleInterval(url.searchParams.get("interval") ?? undefined);

  const [market, book, candles] = await Promise.all([
    marketDataAdapter.getMarketSummary("default"),
    marketDataAdapter.getOrderBook("default"),
    marketDataAdapter.getCandles("default", interval),
  ]);

  return Response.json(
    { market, book, candles },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
