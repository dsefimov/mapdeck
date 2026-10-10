/**
 * The COPC protocol's public surface. The streaming engine behind it is
 * invisible to the rest of the kernel — only the protocol and
 * its feature provider cross this boundary; registration wires them.
 */
export { CopcProtocol } from "./CopcProtocol";
export { OverlayFeatureProvider } from "./OverlayFeatureProvider";
export { COPC_PROTOCOL_ID } from "./types";
