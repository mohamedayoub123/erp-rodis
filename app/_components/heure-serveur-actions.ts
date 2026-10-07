"use server";

// Heure du serveur de l'ERP (synchronisee sur internet), en millisecondes - le navigateur s'en sert pour
// corriger l'horloge de l'appareil (voir time-text-input-maintenant.tsx).
export async function heureServeurAction(): Promise<number> {
  return Date.now();
}
