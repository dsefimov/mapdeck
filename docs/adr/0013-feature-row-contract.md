# ADR-0013: FeatureRow — typed reserved row keys

Status: Accepted · Date: 2026-09-22

## Context

Attribute-serving protocols (WFS, OGC Features) flatten features into rows consumed by
the attribute table. Rows carry data columns plus service-reserved keys (`_bbox`: the
geometry-derived zoom target read by `AttributeTableStore`). Typing rows as plain string
maps would leave the reserved-key rule to comments and an eslint allowlist.

## Decision

`contracts/domain/attribute.ts` declares `FeatureRow`: an index signature
over data properties plus explicitly typed reserved fields (`_bbox?: Bbox`),
and `AttributeFetchResult.features` becomes `FeatureRow[]`. The JSDoc on the
interface is the single statement of the convention — writers spread data
properties first, so collisions can never clobber reserved values; the
generic data table keeps receiving `unknown` cells and validates the bbox at
render time. Row identity comes from data columns via `getFeatureId`, so no
`_id` key is reserved.

## Consequences

The boundary is compiler-checked on the reader side: the store reads
`f._bbox` without casts, and new reserved keys added to the interface are
immediately sanctioned everywhere a row is read. The writer side is checked
by convention and tests, not by the compiler — producers build plain objects
and only the documented-shape contract plus the colocated tests keep them
honest. The eslint `no-underscore-dangle` allowlist keeps documenting direct
accesses; it carries `_bbox` alone.
