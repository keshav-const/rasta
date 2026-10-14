import "server-only";
import { createClient } from "@supabase/supabase-js";

// Admin client: uses the service_role key, bypasses RLS. Server-only.
export function supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
