# MEV — MongoDB Explain Visualizer

**Live site: <https://vbergeron.github.io/mev/>**

Paste the output of `.explain("executionStats")` for a `find()` or an `aggregate()`
and read the plan as a tree, in the spirit of [explain.dalibo.com](https://explain.dalibo.com).
Everything runs in the browser: nothing is sent anywhere.

- **Input**: JSON, Extended JSON, or mongosh output (`ObjectId(…)`, `ISODate(…)`, `Long(…)`, unquoted keys…).
- **Engines**: classic and slot-based (SBE, MongoDB 7.0+). SBE stats are mapped onto the
  logical `queryPlan` by `planNodeId`; the raw slot-based plan stays available in its own tab.
- **Aggregations**: stages left in the pipeline are stacked on top of the `$cursor` tree.
- **Arrows**: width ∝ log(nReturned) of the stage feeding the parent (documents, or index keys for scans).
- **Times**: inclusive (as reported) and exclusive (minus the stages feeding it); the slowest stage is highlighted.
- **Diagnostics**: `COLLSCAN`, blocking sorts, disk spills, deep skips, and the examined ÷ returned
  ratio (≤ 2 ok, ≤ 10 warn, > 10 bad).

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # parser + normalisation tests
npm run build      # static site in dist/
```

`src/lib/parse.ts` (tolerant parser) → `src/lib/explain.ts` (normalisation into a `PlanNode` tree)
→ `src/components/` (React + Tailwind).

The built-in examples in `src/samples/` are hand-written approximations of real explain
output; they will be replaced by outputs captured from a live server.

## CI / Release

- `.github/workflows/ci.yml` runs lint, typecheck, tests and build on every push to `main` and every pull request.
- `.github/workflows/pages.yml` runs the same checks, then publishes `dist/` to GitHub Pages when a `v*` tag is pushed:

```sh
git tag v0.1.0
git push origin v0.1.0
```

One-time setup: in *Settings → Pages* set **Source** to **GitHub Actions**, then in
*Settings → Environments → github-pages → Deployment branches and tags* add a tag rule `v*`
(by default only the default branch may deploy).
