import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/app/AppShell";

export const metadata: Metadata = {
  title: "Browser extension",
};

export default function ExtensionSettingsPage() {
  return (
    <AppShell>
      <div className="page lr-settings-page">
        <p className="lr-settings-back">
          <Link href="/settings" className="db-link-ghost">
            ← Settings
          </Link>
        </p>
        <h1>Browser extension</h1>
        <p className="muted">
          The Chrome extension is a separate package from this web app. Vercel deploys the app only—not
          the extension.
        </p>

        <section className="card lr-settings-card">
          <h2>Repository &amp; build</h2>
          <p className="muted">Extension source lives alongside the app in the monorepo.</p>
          <ul className="lr-settings-help-list">
            <li>
              Path: <code className="lr-settings-code">extensions/lenguariver-extension</code>
            </li>
            <li>
              Build (from <code className="lr-settings-code">LenguaRiver/</code>):
              <pre className="lr-settings-pre">
                <code>cd extensions/lenguariver-extension{"\n"}npm run build</code>
              </pre>
            </li>
            <li>
              Load unpacked:{" "}
              <code className="lr-settings-code">extensions/lenguariver-extension/.output/chrome-mv3</code>
            </li>
          </ul>
        </section>

        <section className="card lr-settings-card">
          <h2>Load in Chrome</h2>
          <ol className="lr-settings-help-list lr-settings-help-list--ordered">
            <li>
              Open <code className="lr-settings-code">chrome://extensions</code>
            </li>
            <li>Enable Developer mode</li>
            <li>Click Load unpacked and select the build folder above</li>
          </ol>
        </section>

        <section className="card lr-settings-card">
          <h2>Automatic sync</h2>
          <p className="muted">
            Automatic sync works on configured LenguaRiver web origins. Local dev currently supports localhost:3000 and
            localhost:3001. When the extension and My Words are open in the same Chrome profile on an allowed origin,
            words saved with the extension can appear here automatically. If sync does not work, export JSON from the
            extension popup and import it on My Words. This is local browser sync only — not cloud sync. Custom uploaded
            card images stay on this device.
          </p>
        </section>

        <section className="card lr-settings-card">
          <h2>Data &amp; sync</h2>
          <ul className="lr-settings-help-list">
            <li>Extension → <code className="lr-settings-code">chrome.storage.local</code></li>
            <li>
              My Words → <code className="lr-settings-code">localStorage</code> (this app)
            </li>
            <li>
              Automatic sync on allowed web origins (localhost:3000 and localhost:3001 in local dev; production URLs in{" "}
              <code className="lr-settings-code">extensions/lenguariver-extension/lib/web-bridge.ts</code>)
            </li>
            <li>Manual backup: Export JSON in the extension popup, Import JSON on My Words</li>
          </ul>
        </section>

        <section className="card lr-settings-card">
          <h2>Manual workflow</h2>
          <ol className="lr-settings-help-list lr-settings-help-list--ordered">
            <li>Save words with the extension on any page</li>
            <li>Open the extension popup → Export JSON</li>
            <li>
              Go to <Link href="/my-words">My Words</Link> → Import JSON
            </li>
            <li>Fix detected languages where needed</li>
            <li>Enrich cards that are still missing data</li>
          </ol>
        </section>

        <section className="card lr-settings-card">
          <h2>Limitations</h2>
          <ul className="lr-settings-help-list">
            <li>
              Production Vercel and lenguariver.com origins are documented in the extension bridge; uncomment and set real
              URLs in <code className="lr-settings-code">web-bridge.ts</code> before relying on deployed sync
            </li>
            <li>Custom uploaded card images are not included in JSON export</li>
            <li>The extension is not deployed by Vercel</li>
          </ul>
        </section>

        <section className="card lr-settings-card">
          <h2>Future</h2>
          <p className="muted" style={{ margin: 0 }}>
            Chrome Web Store package or downloadable ZIP; optional cloud sync after auth and a shared backend.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
