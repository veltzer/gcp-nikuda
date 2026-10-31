# TOFIX

Findings from a code scan on 2026-10-04.

## Medium

- `pyproject.toml:11` - `webtest` is a runtime dependency although only `tests/app_test.py` uses it, so it is installed into the production image; move it to the `dev` dependency group.
- `src/main.py:61-62` and `src/main.py:71-73` - `/app/suggest` and `/app/naked` index `obj["Naked"]` on whatever JSON arrives; a missing key, a non-dict body or a non-list body raises and returns 500 (and `/app/naked` accepts an unbounded list); validate the payload and return 400.
- `rsconstruct.toml:28` and `rsconstruct.toml:32` - `ruff` and `mypy` list `config` in `src_dirs`, but `config/` holds only `.lua` files; drop `config`.
- `rsconstruct.toml:40` - `shellcheck` scans `src`, `misc` and `config`, none of which contains a shell script (the repo tracks no `.sh` files); remove the processor or point it at real scripts.
