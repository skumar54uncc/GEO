# Decisions Log

## 2026-11-06

- Passwordless email login is a local-development convenience only. It refuses
  `NODE_ENV=production`, any configured bind other than
  `APP_BIND_HOST=127.0.0.1`, and requests not addressed to `127.0.0.1`.
- This is a known limitation, not production authentication. Magic-link
  authentication or university SSO is required before any hosting, LAN
  exposure, reverse proxy, or public deployment.

## 2026-10-21

- Laptop hosting for now, multi-tenant design from day one. (ARCHITECTURE section 12)
- Provider plan and budget in `docs/PROVIDERS.md`. Budget pending manager approval.
- Personas are prompt phrasing, not personalized accounts. Stated in the UI.
- No self-built logged-in chat UI automation.

## Open: ownership of the code

This platform is being built as part of a UNC Charlotte job, at a supervisor's direction. UNC Charlotte policy UP-315 says works made for hire by SHRA staff belong to the University, and works created at the University's direction can be University owned.
Before any commercial use, LLC, or sale to other universities, get a written answer from UNC Charlotte Legal Affairs or the technology transfer office on who owns it and whether a license or release is possible. Not legal advice.
