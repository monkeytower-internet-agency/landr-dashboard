# Standalone comic SVGs

These files (`mascot-*.svg`, `scene-*.svg`) are static exports hand-copied
from the React components that render the same mascot/scenes at runtime:

- `mascot-*.svg` mirror the pose compositions in
  `src/components/illustrations/Mascot.tsx` (`Head`, `SparkeStar`,
  `PoseWave`, `PoseCelebrate`, etc.).
- `scene-*.svg` mirror the compositions in
  `src/components/illustrations/scenes/`.

They are used where a plain `<img src>`/static asset is needed (e.g. emails,
marketing surfaces, anywhere the React tree isn't mounted) and are **not**
generated automatically — editing a shape in the React component does not
update the corresponding SVG here, and vice versa. When you change a pose,
color, or facial expression in `Mascot.tsx` (or a scene file), check whether
the matching static SVG in this directory needs the same edit, and update it
by hand.

If drift here becomes a recurring problem, the fix is to generate these files
from the React components (e.g. a `ReactDOMServer.renderToStaticMarkup`
export script run in CI/precommit) instead of hand-copying — see
landr-x2kt for context.
