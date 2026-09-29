import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";

export async function GET(request: NextRequest) {
  return executeRoute(request, {}, async ({ actor }) => ok(actor));
}

