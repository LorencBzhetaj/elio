/**
 * MapLibre GL runtime. This module (and the ~250 kB library + CSS) is only imported on demand when a
 * map container becomes visible, so it never weighs on the hero or other pages.
 */
import { Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BBox } from '../filters/core';
import type * as GeoJSON from 'geojson';

setWorkerUrl(workerUrl);

export interface MapPoint {
  id: string;
  kind: string;
  title: string;
  coords: [number, number];
}

export interface MapRuntimeOptions {
  container: HTMLElement;
  styleUrl: string;
  font: string;
  bounds: BBox;
  /** preview maps don't capture scroll/one-finger drags */
  cooperative?: boolean;
  onSelect?: (id: string) => void;
  onUserMove?: () => void;
  onClusterLeaves?: (ids: string[]) => void;
  /** Tap/click on the map where there is no pin or group. */
  onBackgroundClick?: () => void;
}

export interface MapRuntime {
  setPoints(points: MapPoint[]): void;
  setPremium(points: MapPoint[]): void;
  /** `offsetY` shifts the pin up (negative) so it stays visible above a card covering the bottom. */
  select(id: string | null, opts?: { fly?: boolean; coords?: [number, number]; keepZoom?: boolean; offsetY?: number }): void;
  getBounds(): BBox;
  fitPoints(points: MapPoint[]): void;
  resize(): void;
  destroy(): void;
}

const COLORS = { destination: '#7a1830', place: '#1f7a8c', event: '#b8641b', premium: '#c98a16' };

const toFeatures = (points: MapPoint[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p.coords }, properties: { id: p.id, kind: p.kind, title: p.title } })),
});

export function createMapRuntime(opts: MapRuntimeOptions): Promise<MapRuntime> {
  return new Promise((resolve, reject) => {
    let loaded = false;
    let map: MlMap;
    try {
      map = new MlMap({
        container: opts.container,
        style: opts.styleUrl,
        bounds: opts.bounds,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
        cooperativeGestures: Boolean(opts.cooperative),
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxZoom: 17,
      });
    } catch (err) {
      reject(err); // e.g. WebGL unavailable
      return;
    }
    const timeout = setTimeout(() => !loaded && fail(new Error('Map timed out')), 15000);
    function fail(err: unknown) {
      if (loaded) return;
      clearTimeout(timeout);
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      reject(err);
    }
    map.on('error', (e) => !loaded && fail(e.error ?? new Error('Map error')));
    // Dev-only hook for browser tests (finding pin positions); stripped from production builds.
    if (import.meta.env.DEV) (opts.container as HTMLElement & { __map?: MlMap }).__map = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      loaded = true;
      clearTimeout(timeout);
      map.addSource('places', { type: 'geojson', data: toFeatures([]), cluster: true, clusterRadius: 44, clusterMaxZoom: 12 });
      map.addSource('premium', { type: 'geojson', data: toFeatures([]) });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#7a1830',
          'circle-opacity': 0.92,
          'circle-stroke-color': '#faf5eb',
          'circle-stroke-width': 3,
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 15, 28],
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'places',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': [opts.font], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'points',
        type: 'circle',
        source: 'places',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'kind'], 'place', COLORS.place, 'event', COLORS.event, COLORS.destination],
          'circle-radius': 9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'premium-points',
        type: 'circle',
        source: 'premium',
        paint: { 'circle-color': COLORS.premium, 'circle-radius': 8, 'circle-stroke-color': '#29221f', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'selected',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 16, 'circle-stroke-color': '#7a1830', 'circle-stroke-width': 4 },
      });

      for (const layer of ['clusters', 'points', 'premium-points']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }
      map.on('click', 'clusters', async (e) => {
        const f = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!f) return;
        const src = map.getSource('places') as GeoJSONSource;
        const clusterId = f.properties.cluster_id as number;
        const zoom = await src.getClusterExpansionZoom(clusterId);
        const center = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        if (zoom > map.getMaxZoom() - 1) {
          // Points too close to separate: show the places in this group instead.
          const leaves = await src.getClusterLeaves(clusterId, 50, 0);
          opts.onClusterLeaves?.(leaves.map((l) => String(l.properties?.id)));
        } else {
          map.easeTo({ center, zoom });
        }
      });
      map.on('click', 'points', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) opts.onSelect?.(String(id));
      });
      map.on('click', 'premium-points', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) opts.onSelect?.(String(id));
      });
      map.on('click', (e) => {
        if (!opts.onBackgroundClick) return;
        const hit = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'points', 'premium-points'] });
        if (hit.length === 0) opts.onBackgroundClick();
      });
      map.on('moveend', (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) opts.onUserMove?.();
      });

      resolve({
        setPoints(points) {
          (map.getSource('places') as GeoJSONSource).setData(toFeatures(points));
        },
        setPremium(points) {
          (map.getSource('premium') as GeoJSONSource).setData(toFeatures(points));
        },
        select(id, o = {}) {
          map.setFilter('selected', ['==', ['get', 'id'], id ?? '__none__']);
          if (id && o.fly && o.coords) {
            map.easeTo({
              center: o.coords,
              zoom: o.keepZoom ? map.getZoom() : Math.max(map.getZoom(), 11),
              offset: [0, o.offsetY ?? 0],
              duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500,
            });
          }
        },
        getBounds() {
          const b = map.getBounds();
          return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        },
        fitPoints(points) {
          if (!points.length) return;
          const lngs = points.map((p) => p.coords[0]);
          const lats = points.map((p) => p.coords[1]);
          map.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: 60, maxZoom: 11, duration: 0 });
        },
        resize: () => map.resize(),
        destroy: () => map.remove(),
      });
    });
  });
}
