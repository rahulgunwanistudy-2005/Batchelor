import { marketDataAdapter } from "@/lib/market-data/adapter";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    return Response.json({ error: "A batch ID must be a positive whole number." }, { status: 400 });
  }

  const result = await marketDataAdapter.getBatchResult("default", id);
  return Response.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
