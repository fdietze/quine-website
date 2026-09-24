# quine-website

The public deployment target of quine's website, served by GitHub Pages from
branch `gh-pages`.

- Source: `website/` in fdietze/quine (landing page, privacy policy), plus the
  Browser shell under `app/` (`nix build .#website`).
- `gh-pages` holds exactly one commit and is overwritten by quine's CI (job
  `website` in `.github/workflows/build.yml`) after every green build.
  Edit the source, not this repository.

Live: https://fdietze.github.io/quine-website/ ·
[privacy policy](https://fdietze.github.io/quine-website/privacy.html)
