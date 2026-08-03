"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PersistPageFiltersProps = {
  storageKey?: string;
};

export function PersistPageFilters({
  storageKey = "erp-rodis-page-filters",
}: PersistPageFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRestoredRef = useRef(false);

  const pageKey = useMemo(() => {
    return `${storageKey}:${pathname}`;
  }, [pathname, storageKey]);

  const queryString = searchParams.toString();

  useEffect(() => {
    if (hasRestoredRef.current) {
      return;
    }

    hasRestoredRef.current = true;

    if (typeof window === "undefined") {
      return;
    }

    if (queryString.length > 0) {
      window.sessionStorage.setItem(pageKey, queryString);
      return;
    }

    const savedQuery = window.sessionStorage.getItem(pageKey);
    if (!savedQuery) {
      return;
    }

    router.replace(`${pathname}?${savedQuery}`, { scroll: false });
  }, [pageKey, pathname, queryString, router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (queryString.length > 0) {
      window.sessionStorage.setItem(pageKey, queryString);
    }
  }, [pageKey, queryString]);

  return null;
}
