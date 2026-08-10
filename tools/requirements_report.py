"""Render the requirement traceability report from tagged test results.

Reads the JSON written by ``pytest --requirements-json`` (see the hooks at the
bottom of test/backend/conftest.py) and produces a page that pairs each
requirement with the tests that demonstrate it.

The point is that nothing here is hand-maintained. Tag a test with
``@pytest.mark.requirement("FR10.4")`` and it appears; delete the test and it
disappears. A requirement listed in the registry with no tagged test shows up
as an explicit gap rather than being quietly omitted, which is the whole reason
this exists instead of a table of file paths and line ranges.

Usage:
    python tools/requirements_report.py --results req.json --out report.html
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "test" / "backend"))

from requirements_registry import (  # noqa: E402
    PROPOSED,
    REQUIREMENTS,
    is_demo_only,
    is_proposed,
)


def _status(entries: list[dict], demo_only: bool = False) -> tuple[str, str]:
    """(css class, label) for one requirement's tests."""
    if not entries:
        # Demo-only is a decision the team recorded in the requirements
        # document; anything else with no tests is an unfilled gap.
        return ("demo", "Demo walkthrough") if demo_only else ("gap", "Not yet mapped")
    outcomes = [e["outcome"] for e in entries]
    passed = sum(1 for o in outcomes if o == "passed")
    if any(o == "failed" for o in outcomes):
        return "fail", f"{passed}/{len(outcomes)} passing"
    if all(o == "passed" for o in outcomes):
        return "pass", f"{passed}/{len(outcomes)} passing"
    return "partial", f"{passed}/{len(outcomes)} passing"


def build_rows(results: dict[str, list[dict]]) -> list[dict]:
    rows = []
    known = {**REQUIREMENTS, **PROPOSED}
    for requirement_id in sorted(
        set(known) | set(results), key=lambda r: (r[:2], [int(p) for p in r[2:].split(".")])
    ):
        entries = results.get(requirement_id, [])
        demo_only = is_demo_only(requirement_id)
        css, label = _status(entries, demo_only)
        rows.append(
            {
                "id": requirement_id,
                "text": known.get(requirement_id, "(not in the requirements registry)"),
                "proposed": is_proposed(requirement_id),
                "demo": demo_only,
                "entries": entries,
                "css": css,
                "label": label,
            }
        )
    return rows


def render_html(rows: list[dict]) -> str:
    generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    covered = sum(1 for r in rows if r["css"] == "pass")
    gaps = sum(1 for r in rows if r["css"] == "gap")
    demos = sum(1 for r in rows if r["css"] == "demo")
    failing = sum(1 for r in rows if r["css"] == "fail")
    total_tests = sum(len(r["entries"]) for r in rows)

    parts = [
        "<title>Requirement traceability</title>",
        _STYLE,
        "<main>",
        "<h1>Requirement traceability</h1>",
        f'<p class="sub">Generated {html.escape(generated)} from '
        "<code>@pytest.mark.requirement</code> tags — not hand-maintained.</p>",
        '<div class="cards">',
        f'<div class="card ok"><b>{covered}</b><span>covered by passing tests</span></div>',
        f'<div class="card bad"><b>{failing}</b><span>with a failing test</span></div>',
        f'<div class="card"><b>{demos}</b><span>demo walkthrough only</span></div>',
        f'<div class="card warn"><b>{gaps}</b><span>not yet mapped</span></div>',
        f'<div class="card"><b>{total_tests}</b><span>tagged test runs</span></div>',
        "</div>",
        '<div class="scroll"><table>',
        "<thead><tr><th>ID</th><th>Requirement</th><th>Status</th>"
        "<th>Demonstrated by</th></tr></thead><tbody>",
    ]
    for row in rows:
        badge = f'<span class="badge {row["css"]}">{html.escape(row["label"])}</span>'
        proposed = ' <span class="badge proposed">proposed</span>' if row["proposed"] else ""
        if row["entries"]:
            tests = "<ul>" + "".join(
                f'<li class="{e["outcome"]}"><code>{html.escape(e["test"])}</code></li>'
                for e in row["entries"]
            ) + "</ul>"
        elif row["demo"]:
            # The team marked this "demo" in the requirements document: shown
            # by driving the running app, not by an automated test.
            tests = '<span class="muted">Shown by demo walkthrough (no automated test)</span>'
        else:
            # Deliberately not "verified manually" — that would be a claim this
            # script cannot check. Untagged means untagged: nobody has mapped
            # this requirement to a test yet.
            tests = '<span class="muted">Not yet mapped to a test</span>'
        parts.append(
            f'<tr><td class="id"><code>{html.escape(row["id"])}</code>{proposed}</td>'
            f'<td>{html.escape(row["text"])}</td>'
            f"<td>{badge}</td><td>{tests}</td></tr>"
        )
    parts += ["</tbody></table></div>", "</main>"]
    return "\n".join(parts)


_STYLE = """<style>
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#666; --line:#e3e3e3; --card:#f7f7f8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16181c; --fg:#e8e8ea; --muted:#9aa0a6; --line:#2c2f36; --card:#1e2127; }
  }
  :root[data-theme="dark"] {
    --bg:#16181c; --fg:#e8e8ea; --muted:#9aa0a6; --line:#2c2f36; --card:#1e2127;
  }
  :root[data-theme="light"] {
    --bg:#fff; --fg:#1a1a1a; --muted:#666; --line:#e3e3e3; --card:#f7f7f8;
  }
  body { background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:2rem 1.25rem 4rem; }
  h1 { font-size:1.6rem; margin:0 0 .25rem; }
  .sub { color:var(--muted); margin:0 0 1.5rem; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.86em; }
  .cards { display:flex; flex-wrap:wrap; gap:.75rem; margin-bottom:1.5rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
          padding:.75rem 1rem; min-width:9rem; }
  .card b { display:block; font-size:1.5rem; }
  .card span { color:var(--muted); font-size:.82rem; }
  .card.ok b { color:#1a7f45; } .card.warn b { color:#9a6700; } .card.bad b { color:#b3261e; }
  @media (prefers-color-scheme: dark) {
    .card.ok b { color:#5dd48f; } .card.warn b { color:#e3b341; } .card.bad b { color:#ff8a80; }
  }
  .scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; min-width:820px; }
  th, td { text-align:left; padding:.6rem .7rem; border-bottom:1px solid var(--line);
           vertical-align:top; }
  th { font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  td.id { white-space:nowrap; }
  ul { margin:0; padding-left:1.1rem; }
  li { margin:.15rem 0; }
  li.failed code { color:#b3261e; font-weight:600; }
  .muted { color:var(--muted); font-style:italic; }
  .badge { display:inline-block; padding:.15rem .5rem; border-radius:999px;
           font-size:.76rem; font-weight:600; white-space:nowrap; }
  .badge.pass { background:#dcf5e6; color:#1a7f45; }
  .badge.fail { background:#fde4e1; color:#b3261e; }
  .badge.partial, .badge.proposed { background:#fdf1d6; color:#8a6100; }
  .badge.gap { background:#eceef1; color:#5b6169; }
  .badge.demo { background:#e2ecfd; color:#1f4c9c; }
  @media (prefers-color-scheme: dark) {
    .badge.pass { background:#14361f; color:#5dd48f; }
    .badge.fail { background:#3a1a17; color:#ff8a80; }
    .badge.partial, .badge.proposed { background:#3a2f12; color:#e3b341; }
    .badge.gap { background:#262a30; color:#9aa0a6; }
    .badge.demo { background:#182a45; color:#8ab4f8; }
  }
</style>"""


def render_markdown(rows: list[dict]) -> str:
    lines = ["| ID | Requirement | Status | Demonstrated by |", "|---|---|---|---|"]
    for row in rows:
        if row["entries"]:
            tests = "<br>".join(f"`{e['test']}`" for e in row["entries"])
        elif row["demo"]:
            tests = "_Shown by demo walkthrough_"
        else:
            tests = "_Not yet mapped_"
        suffix = " _(proposed)_" if row["proposed"] else ""
        lines.append(f"| `{row['id']}`{suffix} | {row['text']} | {row['label']} | {tests} |")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", required=True, help="JSON from --requirements-json")
    parser.add_argument("--out", required=True, help="output .html or .md path")
    args = parser.parse_args()

    results = json.loads(Path(args.results).read_text())
    rows = build_rows(results)
    body = render_markdown(rows) if args.out.endswith(".md") else render_html(rows)
    Path(args.out).write_text(body)

    counts = {"pass": 0, "fail": 0, "partial": 0, "demo": 0, "gap": 0}
    for row in rows:
        counts[row["css"]] += 1
    print(
        f"{args.out}: {len(rows)} requirements, {counts['pass']} covered, "
        f"{counts['fail'] + counts['partial']} with a failing test, "
        f"{counts['demo']} demo-only, {counts['gap']} not yet mapped"
    )


if __name__ == "__main__":
    main()
