/**
 * A single plane: unit normal plus the signed plane constant.
 *
 * Follows deck.gl's `getFrustumPlanes`, whose normal points out of the frustum
 * and whose `distance` is signed — negative for the left and bottom planes.
 * An outside test reads `normal · point > distance`, in the same absolute
 * common space as the `viewProjectionMatrix` the planes are derived from.
 */
export interface FrustumPlane {
    distance: number;
    normal: [number, number, number];
}

/** Six frustum planes in deck.gl world coordinates (Web Mercator meters). */
export interface FrustumPlanes {
    near: FrustumPlane;
    far: FrustumPlane;
    left: FrustumPlane;
    right: FrustumPlane;
    top: FrustumPlane;
    bottom: FrustumPlane;
}
