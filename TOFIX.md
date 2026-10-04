# TOFIX

Findings from a code scan on 2026-10-04.

## Medium

- `Dockerfile:36-38` - the image installs `[project].dependencies` straight from `pyproject.toml` with no lockfile, so every Cloud Run build resolves the newest flask/gunicorn/werkzeug instead of what `uv.lock` pins (and what CI tested); copy `uv.lock` and install from it (e.g. `uv export --frozen --no-dev | uv pip install --system -r -`). The `.gcloudignore:2` comment already claims `uv.lock` is uploaded for this.
- `pyproject.toml:11` - `webtest` is a runtime dependency although only `tests/app_test.py` uses it, so it is installed into the production image; move it to the `dev` dependency group.
- `src/main.py:61-62` and `src/main.py:71-73` - `/app/suggest` and `/app/naked` index `obj["Naked"]` on whatever JSON arrives; a missing key, a non-dict body or a non-list body raises and returns 500 (and `/app/naked` accepts an unbounded list); validate the payload and return 400.
- `rsconstruct.toml:28` and `rsconstruct.toml:32` - `ruff` and `mypy` list `config` in `src_dirs`, but `config/` holds only `.lua` files; drop `config`.
- `rsconstruct.toml:40` - `shellcheck` scans `src`, `misc` and `config`, none of which contains a shell script (the repo tracks no `.sh` files); remove the processor or point it at real scripts.

## Low

- `src/apple-touch-icon.png`, `src/apple-touch-icon-*.png`, `src/favicon.ico` - root-level icons are unreachable: `src/main.py:39-43` serves only `/static/{css,images,js,js_tp}/`, so browsers' `/favicon.ico` and `/apple-touch-icon.png` requests 404; add root routes for them or delete the files.
- `.gcloudignore:10-23` - ignores `/scripts`, `/Makefile`, `/package.json`, `/package-lock.json`, `/templates`, `/requirements.thawed.txt`, `/gcloud` - none exist in the repo any more; drop the stale entries.
- `support/gjslint.cfg`, `support/jsl.conf` - configs for the long-dead Closure Linter and JavaScript Lint, referenced by nothing; delete them.
- `src/main.py:46` - comment "this route is not needed in production" is wrong on Cloud Run, where Flask serves `/` itself (no App Engine static handlers); remove the comment.
- `pyproject.toml:27` - `mypy_path = "src:python:scripts"` names `python/` and `scripts/`, which do not exist; reduce it to `src`.
- `src/main.py:2` - typo "nikua" for "nikuda".
