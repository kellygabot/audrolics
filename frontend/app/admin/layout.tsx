"use client";
import { Protected } from "@/lib/session";
export default function Layout({ children }: { children: React.ReactNode }) { return <Protected role="ADMIN">{children}</Protected>; }
