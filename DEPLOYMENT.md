# GitHub Pages deployment

This Vite app deploys from the repository's `main` branch to GitHub Pages. Supabase remains the app's backend; Pages only hosts the frontend.

## One-time GitHub setup

1. In **Settings → Secrets and variables → Actions**, add these repository secrets:
   - `VITE_SUPABASE_URL`: the Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: the Supabase publishable/anon key.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Merge the app and `.github/workflows/deploy-pages.yml` into `main`. Each push to `main` then builds and deploys the app. A run can also be started from **Actions → Deploy to GitHub Pages → Run workflow**.

The Supabase anon key is included in the browser bundle by design. Never use a Supabase `service_role` key here; keep Row Level Security enabled and policies configured for the app.

The deployment workflow creates a `404.html` fallback so direct links and page refreshes continue to work on GitHub Pages. For password-reset or other auth email links, allow `https://kalyanibhaskarsrv-maker.github.io/MIS-Team-Tracke/**` in the Supabase project's **Authentication → URL Configuration → Redirect URLs**.
