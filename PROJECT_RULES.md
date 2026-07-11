Follow the PROJECT_RULES.md file strictly.

Create a simple web app for a language learning platform called LenguaRiver.

Requirements:
- Use Next.js with TypeScript
- Clean, minimal UI
- Pages:
  - Home
  - Lesson
  - Review
  - Progress

The app should focus on structured lessons, not random exercises.

Each lesson should contain:
- A list of sentences
- Each sentence has:
  - text
  - translation
  - audio placeholder
  - list of words

Do not add extra features beyond MVP.

After creating the project, explain the file structure in simple terms.

## Vercel (this repo)

When the Git repository root is `LenguaRiver_v2` (parent of this app), configure the Vercel project as follows:

- **Root Directory:** `LenguaRiver` (so builds use this folder’s `package.json` and Next.js app).
- **Environment variables:** set `NEXT_PUBLIC_SITE_URL` to your canonical site URL, for example `https://your-project.vercel.app` (replace with your real `.vercel.app` or custom domain). Use the same value in Production and Preview unless you intentionally want different bases.

See `.env.example` for the variable name and placeholder.
