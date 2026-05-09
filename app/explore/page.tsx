import { AppShell } from "@/app/AppShell";
import ExploreClient from "./ExploreClient";
import type { ExploreSeedFile } from "@/lib/explore-content";
import seedData from "@/scripts/explore/output/es-explore-content.json";

const exploreSeed = seedData as ExploreSeedFile;

export default function ExplorePage() {
  return (
    <AppShell>
      <ExploreClient items={exploreSeed.items} />
    </AppShell>
  );
}
