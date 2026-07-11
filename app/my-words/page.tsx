import type { Metadata } from "next";
import { AppShell } from "@/app/AppShell";
import MyWordsClient from "./MyWordsClient";

export const metadata: Metadata = {
  title: "My Words",
};

export default function MyWordsPage() {
  return (
    <AppShell>
      <MyWordsClient />
    </AppShell>
  );
}
