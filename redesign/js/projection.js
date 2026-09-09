/**
 * Natural Earth I projection (Šavrič et al. 2011) and GeoJSON → SVG path
 * conversion. Small enough that no mapping library is needed.
 */

const RAD = Math.PI / 180;

/** Raw Natural Earth I: lambda/phi in radians → unitless x/y. */
function naturalEarth1(lambda, phi) {
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  return [
    lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4))),
    phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))),
  ];
}

/**
 * Creates a projector fitted to a width×height viewport.
 * Returns { project(lng, lat) → [x, y], width, height, spherePath }.
 */
export function createProjection(width) {
  // World extent in raw units: x ∈ [−xMax, xMax] at the equator edge.
  const [xMax] = naturalEarth1(Math.PI, 0);
  const [, yMax] = naturalEarth1(0, Math.PI / 2);
  const scale = width / (2 * xMax);
  const height = Math.ceil(2 * yMax * scale);
  const cx = width / 2;
  const cy = height / 2;

  function project(lng, lat) {
    const [x, y] = naturalEarth1(lng * RAD, lat * RAD);
    return [cx + x * scale, cy - y * scale];
  }

  // Outline of the projected sphere: walk the antimeridians.
  const steps = [];
  for (let lat = -90; lat <= 90; lat += 3) steps.push(project(180, lat));
  for (let lat = 90; lat >= -90; lat -= 3) steps.push(project(-180, lat));
  const spherePath = 'M' + steps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';

  return { project, width, height, spherePath };
}

/** All land features as one SVG path string. */
export function geoToPath(geojson, project) {
  const parts = [];
  for (const feature of geojson?.features ?? []) {
    const geom = feature?.geometry;
    if (!geom) continue;
    const polygons = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates
      : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (!ring?.length) continue;
        const pts = ring.map(([lng, lat]) => {
          const [x, y] = project(lng, lat);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        parts.push('M' + pts.join('L') + 'Z');
      }
    }
  }
  return parts.join('');
}
