import { supabaseServer } from "@/lib/supabase-server";

export type AuditAction = "creation" | "modification" | "suppression";

// Best-effort : une panne du journal ne doit jamais faire echouer l'action
// metier qu'il enregistre (delete/update deja effectue en base a ce stade).
export async function logAudit(params: {
  utilisateur: string | null | undefined;
  module: string;
  action: AuditAction;
  cible?: string | null;
  resume: string;
}) {
  try {
    const { error } = await supabaseServer.from("audit_log").insert({
      utilisateur: params.utilisateur || null,
      module: params.module,
      action: params.action,
      cible: params.cible || null,
      resume: params.resume,
    });

    if (error) {
      console.error("logAudit a echoue:", error.message);
    }
  } catch (err) {
    console.error("logAudit a echoue:", err);
  }
}
