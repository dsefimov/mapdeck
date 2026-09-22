# ADR-0013: FeatureRow — typed reserved row keys

## Context

Attribute-serving protocols (WFS, OGC Features) flatten features into rows
consumed by the attribute table. Two service-reserved keys traveled through
that boundary as magic strings: `_bbox` (geometry-derived zoom target, read
by `AttributeTableStore`) and `_id` (written by both clients, read by
nobody). The contract typed rows as `Record<string, unknown>[]`, so the
reserved-key rule lived only in duplicated comments and an eslint
allowlist — nothing stopped a writer from dropping the keys or a consumer
from inventing new ones.

## Decision

`contracts/domain/attribute.ts` declares `FeatureRow`: an index signature
over data properties plus explicitly typed reserved fields (`_bbox?: Bbox`),
and `AttributeFetchResult.features` becomes `FeatureRow[]`. The JSDoc on the
interface is the single statement of the convention — writers spread data
properties first, so collisions can never clobber reserved values; the
generic data table keeps receiving `unknown` cells and validates the bbox at
render time. `_id` is deleted rather than wired up: no reader exists
(row identity comes from data columns via `getFeatureId`), and re-adding a
reserved key when a real consumer appears is one line.

## Consequences

The boundary is compiler-checked on the reader side: the store reads
`f._bbox` without casts, and new reserved keys added to the interface are
immediately sanctioned everywhere a row is read. The writer side is checked
by convention and tests, not by the compiler — producers build plain objects
and only the documented-shape contract plus the colocated tests keep them
honest. The eslint `no-underscore-dangle` allowlist keeps documenting direct
accesses; it carries `_bbox` alone.
