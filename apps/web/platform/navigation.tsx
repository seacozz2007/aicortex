"use client";

import { Suspense, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  NavigationProvider,
  type NavigationAdapter,
} from "@aicortex/views/navigation";

function NavigationProviderInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const adapter: NavigationAdapter = useMemo(
    () => ({
      push: router.push,
      replace: router.replace,
      back: router.back,
      pathname,
      searchParams: new URLSearchParams(search),
      getShareableUrl: (path: string) =>
        typeof window === "undefined" ? path : window.location.origin + path,
      prefetch: (path: string) => {
        router.prefetch(path);
      },
    }),
    [router, pathname, search],
  );

  return <NavigationProvider value={adapter}>{children}</NavigationProvider>;
}

export function WebNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <NavigationProviderInner>{children}</NavigationProviderInner>
    </Suspense>
  );
}
