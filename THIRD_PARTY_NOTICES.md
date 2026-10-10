# Third-party notices

Provenance and licensing of code, fonts and artwork that ship with the site but were not written for it.

## Fonts

**Bricolage Grotesque** (variable), © 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage). Licensed under the SIL Open Font License 1.1. Installed from npm as `@fontsource-variable/bricolage-grotesque`, whose package includes the full license text; Vite copies the woff2 files into `dist/assets/` at build time. Chosen in the partnership's design canvas.

## Icons

**Lucide** (`lucide-react`): the Menu and X icons in `src/components/Navbar.tsx`. ISC License, © Lucide Contributors.

## Adapted build pipeline, hosting code and tooling

Parts of the build pipeline, the hosting code and the tooling were adapted, with permission, from LadderUp Housing's marketing site.

The adapted files are `scripts/prerender.mjs`, `scripts/sitemap-urls.mjs`, `src/hydrateApp.tsx`, `src/hooks/useModalA11y.ts`, `src/hooks/useHashScrollRestore.ts`, `src/__tests__/helpers/imageIntrinsicSize.ts`, `infra/lib/website-stack.ts` (the stack's design: buckets, certificate, distribution, deploy role and alarms), `infra/functions/canonical-host.js`, `.github/workflows/deploy.yml` (the manifest-driven, two-phase deploy), `.claude/agents/pr-review-handler.md` and `.claude/scripts/copilot-loop.sh`. They are maintained in this repository like any other file and need nothing outside it: no account, role, bucket or repository of the original.

## Partner logos

The ten logos under `public/images/logo-*.webp` are trademarks of their respective organizations (Historic South Initiative, John Henry Eldred Jr. Foundation, LadderUp Housing, Lucas County Land Bank, Maumee Valley Habitat for Humanity, Toledo LISC, The Believe Center, The Fair Housing Center, Greater Toledo Community Foundation, Sofia Quintero Art & Cultural Center). They appear to identify the partners of the Old South End Partnership. Each partner's confirmation is tracked in `docs/LAUNCH_CHECKLIST.md`. Converted from the files in the partnership's design canvas; see `README.md`, "Images".

## Photographs and map

The photographs and the Pilot Zone map under `public/images/` were supplied by the partnership through its design canvas (September 2026). Rights and the consent of the people pictured are to be confirmed before launch (`docs/LAUNCH_CHECKLIST.md`). The map is an annotated aerial image; confirm the base imagery's attribution requirements with whoever prepared it.

## Brand mark

The ribbon mark (`src/content/brand.ts`, `src/components/BrandMark.tsx`, and the favicons rendered from it) was drawn in the partnership's design canvas by Maria Iafelice.
