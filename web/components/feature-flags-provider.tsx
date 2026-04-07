"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { FeatureFlags, FeatureFlagsPayload } from "@/app/lib/feature-flags-config";

type FeatureFlagsProviderProps = {
  initialFlags: FeatureFlags;
  initialVersion: string | null;
  children: React.ReactNode;
};

type FeatureFlagsContextValue = {
  flags: FeatureFlags;
  version: string | null;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

function areFeatureFlagsEqual(left: FeatureFlags, right: FeatureFlags) {
  const leftKeys = Object.keys(left) as Array<keyof FeatureFlags>;
  const rightKeys = Object.keys(right) as Array<keyof FeatureFlags>;

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

export function FeatureFlagsProvider({ initialFlags, initialVersion, children }: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<FeatureFlags>(initialFlags);
  const [version, setVersion] = useState<string | null>(initialVersion);
  const flagsRef = useRef(initialFlags);
  const versionRef = useRef<string | null>(initialVersion);

  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }

    let cancelled = false;
    const eventSource = new EventSource("/api/feature-flags/stream");

    const applyPayload = (payload: FeatureFlagsPayload) => {
      if (cancelled) {
        return;
      }

      const nextFlags = payload.flags || flagsRef.current;
      const nextVersion = payload.version ?? null;
      const flagsChanged = !areFeatureFlagsEqual(flagsRef.current, nextFlags);
      const versionChanged = versionRef.current !== nextVersion;

      if (!flagsChanged && !versionChanged) {
        return;
      }

      if (flagsChanged) {
        setFlags(nextFlags);
        flagsRef.current = nextFlags;
      }

      setVersion(nextVersion);
      versionRef.current = nextVersion;
    };

    const handleStreamEvent = (event: Event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as FeatureFlagsPayload;
        applyPayload(payload);
      } catch {
        // Ignore malformed stream payloads and keep the last known feature state.
      }
    };

    eventSource.addEventListener("snapshot", handleStreamEvent);
    eventSource.addEventListener("updated", handleStreamEvent);

    return () => {
      cancelled = true;
      eventSource.removeEventListener("snapshot", handleStreamEvent);
      eventSource.removeEventListener("updated", handleStreamEvent);
      eventSource.close();
    };
  }, []);

  return (
    <FeatureFlagsContext.Provider value={{ flags, version }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const value = useContext(FeatureFlagsContext);
  if (!value) {
    throw new Error("useFeatureFlags must be used inside FeatureFlagsProvider");
  }
  return value;
}
