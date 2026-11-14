import { blurFromEnv } from "@/lib/chunks";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(blurFromEnv(process.env));
}
