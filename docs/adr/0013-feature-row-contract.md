# ADR-0013: FeatureRow contract

Status: Accepted · Date: 2026-09-22

## Context

Attribute-serving protocols (WFS, OGC Features) flatten features into rows consumed by
the attribute table. Rows carry data columns plus service-reserved keys (`_bbox`: the
geometry-derived zoom target read by `AttributeTableStore`). Typing rows as plain string
maps would leave the reserved-key rule to comments and an eslint allowlist.

## Decision

`contracts/domain/attribute.ts` declares `FeatureRow`: an index signature over data
properties plus explicitly typed reserved fields (`_bbox?: Bbox`, and
`_featureId?: string | number` — the GeoJSON feature-level id carried through
from the source feature, added by feature selection, ADR-0022), and
`AttributeFetchResult.features` becomes `FeatureRow[]`. The JSDoc on the interface
states the convention: writers spread data properties first, so a data column cannot
overwrite a reserved value; the generic data table keeps receiving `unknown` cells and
validates the bbox at render time. Row identity comes from the feature-level id,
then data columns, via `getFeatureId` — the shared selection key convention
(ADR-0022). The public meaning of the type is
documented in [docs/api/extensions.md](../api/extensions.md).

## Consequences

- The boundary is compiler-checked on the reader side: the store reads `f._bbox` without
  casts, and reserved keys added to the interface type every read site at once.
- The writer side is checked by convention and tests, not by the compiler — producers
  build plain objects; the documented shape and the colocated tests carry the contract.
- The eslint `no-underscore-dangle` allowlist keeps documenting direct accesses; it
  carries `_bbox` and `_featureId`.
