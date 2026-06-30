import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return Response.json(
    { error: "Local downloads have been disabled." },
    { status: 400 }
  );
}
