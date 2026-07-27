import { NextResponse } from "next/server";

import { authorizeITAdmin } from "@/lib/it-admin-access";

export async function GET(request: Request) {
  const access = await authorizeITAdmin(request);
  return NextResponse.json(
    { configured: access.configured, allowed: access.allowed },
    { status: 200 },
  );
}
