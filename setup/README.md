# KnightAuraChess Setup Helpers

This folder keeps setup-only implementation files in one place.

Root-level entry points:

```bash
./setup.sh
```

```powershell
.\setup.ps1
```

What the setup scripts do:

- Prompt for Firebase and optional AI/backend values.
- Write a local `.env` file without committing secrets.
- Install npm dependencies if you choose.
- Validate `wrangler.toml` for Cloudflare Pages + Workers AI.
- Optionally run a production build.

The scripts do not deploy anything and do not push secrets.

Folder layout:

```text
setup.sh                  # root launcher
setup.ps1                 # root launcher
setup/
  run.sh                  # Bash implementation
  run.ps1                 # PowerShell implementation
  validate-cloudflare-config.mjs
  README.md
```
