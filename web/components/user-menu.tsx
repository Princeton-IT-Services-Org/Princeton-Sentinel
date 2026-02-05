"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type UserMenuProps = {
  userLabel: string;
  canAdmin: boolean;
};

export default function UserMenu({ userLabel, canAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm hover:bg-accent"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="text-sm text-muted-foreground">{userLabel}</span>
        <span className="text-xs text-muted-foreground">v</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-40 rounded-md border bg-background p-1 text-sm shadow-lg"
        >
          {canAdmin ? (
            <Link
              href="/admin"
              role="menuitem"
              className="block rounded px-3 py-2 hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              Admin
            </Link>
          ) : null}
          <Link
            href="/api/auth/signout"
            role="menuitem"
            className="block rounded px-3 py-2 hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            Logout
          </Link>
        </div>
      ) : null}
    </div>
  );
}
