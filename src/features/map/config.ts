/**
 * Map tile/style configuration (runtime, server-side).
 * Default: OpenFreeMap "positron" style — free, no API key, OpenStreetMap data, but NO SLA.
 * For production, set PUBLIC_MAP_STYLE_URL to a provider with an agreement (e.g. MapTiler, Stadia Maps,
 * or a self-hosted OpenFreeMap/Protomaps instance). See docs/map.md.
 */
export function mapConfig() {
  const env = typeof process !== 'undefined' ? process.env : {};
  return {
    styleUrl: env.PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron',
    font: env.PUBLIC_MAP_LABEL_FONT || 'Noto Sans Bold',
  };
}
