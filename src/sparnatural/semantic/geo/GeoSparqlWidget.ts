// L needs to be imported *before* leaflet-geoman-free
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { AbstractWidget, ValueRepetition } from "../../components/widgets/AbstractWidget";
import { AddUserInputBtn } from "../../components/buttons/AddUserInputBtn";
import { HTMLComponent } from "../../components/HtmlComponent";
import { SelectedVal } from "../../components/SelectedVal";
import MapWidget, { MapConfiguration } from "../../components/widgets/MapWidget";
import { I18n } from "../../settings/I18n";
import { Criteria, GeoCriteria, LabelledCriteria } from "../../SparnaturalQueryIfc";
import { findGeoRelation, GEO_RELATIONS } from "./GeoRelations";
import { LonLat, looksLikeWkt, parseWkt, SimpleGeometry, toWkt } from "./Wkt";

const label = (key: string, fallback: string): string => I18n.labels?.[key] ?? fallback;

export function geoRelationLabel(id: string): string {
  return label(`GeoRelation.${id}`, id);
}

const toLatLng = ([lon, lat]: LonLat) => L.latLng(lat, lon);
const toLonLat = (p: L.LatLng): LonLat => [p.lng, p.lat];

/**
 * The GeoSPARQL widget: the geometry of the value is within, intersects, contains...
 * a reference geometry drawn on the map or typed as WKT, or is within a distance of it.
 * A circle drawn on the map is a distance from its centre.
 */
export class GeoSparqlWidget extends AbstractWidget {
  #configuration: MapConfiguration;
  #relation!: JQuery<HTMLSelectElement>;
  #distance!: JQuery<HTMLInputElement>;
  #distanceRow!: JQuery<HTMLElement>;
  #wkt!: JQuery<HTMLTextAreaElement>;
  #error!: JQuery<HTMLElement>;
  #map?: L.Map;
  #drawn?: L.Layer;

  constructor(
    configuration: MapConfiguration,
    parentComponent: HTMLComponent,
    startClassVal: SelectedVal,
    objectPropVal: SelectedVal,
    endClassVal: SelectedVal,
  ) {
    super("geosparql-widget", parentComponent, null, startClassVal, objectPropVal, endClassVal, ValueRepetition.SINGLE);
    this.#configuration = { ...MapWidget.defaultConfiguration, ...configuration };
  }

  render(): this {
    super.render();

    this.#relation = $(`<select aria-label="${label("GeoRelationLabel", "Relation")}"></select>`) as JQuery<HTMLSelectElement>;
    GEO_RELATIONS.forEach((r) => this.#relation.append(`<option value="${r.id}">${geoRelationLabel(r.id)}</option>`));
    this.#relation[0].addEventListener("change", () => this.#showDistance());

    this.#distance = $(`<input type="number" min="0" step="any" aria-label="${label("GeoDistance", "Distance")}" />`) as JQuery<HTMLInputElement>;
    this.#distanceRow = $(`<span class="geosparql-distance"></span>`).append(
      this.#distance,
      `<span>${label("GeoKilometresOf", "km of")}</span>`,
    );
    this.html.append($(`<div class="geosparql-row"></div>`).append(this.#relation, this.#distanceRow));

    const mapId = `geosparql-map-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.html.append(`<div id="${mapId}" class="geosparql-map"></div>`);

    this.#wkt = $(
      `<textarea rows="2" spellcheck="false" placeholder="POLYGON((4.33 50.83, 4.40 50.83, 4.40 50.86, 4.33 50.86, 4.33 50.83))" aria-label="${label("GeoWkt", "Reference geometry (WKT)")}"></textarea>`,
    ) as JQuery<HTMLTextAreaElement>;
    this.#wkt[0].addEventListener("change", () => this.#drawWkt());
    this.html.append(
      $(`<label class="geosparql-wkt"></label>`).append(
        `<span>${label("GeoWktHint", "Draw on the map, or type WKT (longitude latitude)")}</span>`,
        this.#wkt,
      ),
    );
    this.#error = $(`<div class="geosparql-error" role="alert"></div>`);
    this.html.append(this.#error);

    new AddUserInputBtn(this, label("ButtonAdd", "Add"), this.#add).render();

    this.#showDistance();
    // Leaflet needs the container in the page to measure it
    setTimeout(() => this.#renderMap(mapId), 0);
    return this;
  }

  #showDistance() {
    this.#distanceRow.toggle(this.#relation.val() === "withinDistance");
  }

  #renderMap(mapId: string) {
    if (!document.getElementById(mapId)) return;
    this.#map = L.map(mapId);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(this.#map);
    this.#map.setView([this.#configuration.center.lat, this.#configuration.center.long], this.#configuration.zoom);

    this.#map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircleMarker: true,
      drawPolyline: true,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: true,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      editMode: true,
      dragMode: true,
      removalMode: true,
    });

    this.#map.on("pm:create", (e: any) => {
      if (this.#drawn) this.#map!.removeLayer(this.#drawn);
      this.#drawn = e.layer;
      e.layer.on("pm:edit", () => this.#readDrawing());
      this.#readDrawing();
    });
    this.#map.on("pm:remove", () => {
      this.#drawn = undefined;
      this.#wkt.val("");
    });
    this.#map.invalidateSize();
  }

  // the drawn shape into the WKT field (and the distance, for a circle)
  #readDrawing() {
    const layer: any = this.#drawn;
    if (!layer) return;
    let geometry: SimpleGeometry;
    if (layer instanceof L.Circle) {
      geometry = { type: "Point", coordinates: toLonLat(layer.getLatLng()) };
      this.#relation.val("withinDistance");
      this.#distance.val(String(Math.round(layer.getRadius()) / 1000));
      this.#showDistance();
    } else if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
      geometry = { type: "Point", coordinates: toLonLat(layer.getLatLng()) };
    } else if (layer instanceof L.Polygon) {
      const rings = (layer.getLatLngs() as L.LatLng[][]).map((ring) => ring.map(toLonLat));
      geometry = { type: "Polygon", coordinates: rings };
    } else if (layer instanceof L.Polyline) {
      geometry = { type: "LineString", coordinates: (layer.getLatLngs() as L.LatLng[]).map(toLonLat) };
    } else {
      return;
    }
    this.#wkt.val(toWkt(geometry));
    this.#error.text("");
  }

  // the typed WKT onto the map, when the widget can draw it
  #drawWkt() {
    if (!this.#map) return;
    const geometry = parseWkt(String(this.#wkt.val()));
    if (this.#drawn) this.#map.removeLayer(this.#drawn);
    this.#drawn = undefined;
    if (!geometry) return;
    let layer: L.Layer;
    if (geometry.type === "Point") layer = L.circleMarker(toLatLng(geometry.coordinates));
    else if (geometry.type === "LineString") layer = L.polyline(geometry.coordinates.map(toLatLng));
    else layer = L.polygon(geometry.coordinates.map((r) => r.map(toLatLng)));
    layer.addTo(this.#map);
    layer.on("pm:edit", () => this.#readDrawing());
    this.#drawn = layer;
    const bounds = (layer as any).getBounds?.();
    if (bounds) this.#map.fitBounds(bounds, { maxZoom: 16 });
    else this.#map.setView((layer as L.CircleMarker).getLatLng(), Math.max(this.#map.getZoom(), 12));
  }

  #add = () => {
    const criteria: GeoCriteria = {
      geoRelation: String(this.#relation.val()),
      wkt: String(this.#wkt.val() ?? "").trim(),
    };
    if (criteria.geoRelation === "withinDistance") {
      const km = parseFloat(String(this.#distance.val()));
      if (!(km >= 0)) {
        this.#error.text(label("GeoInvalidDistance", "Enter a distance."));
        return;
      }
      criteria.distance = Math.round(km * 1000 * 1000) / 1000;
    }
    try {
      this.parseInput({ label: "", criteria });
    } catch (e) {
      this.#error.text(label("GeoInvalidWkt", "Draw a shape or type a valid WKT geometry."));
      return;
    }
    this.#error.text("");
    this.triggerRenderWidgetVal(this.buildValueFromCriteria(criteria));
  };

  getValueLabel(criteria: Criteria): string {
    const c = criteria as GeoCriteria;
    const geometry = parseWkt(c.wkt);
    let shape: string;
    if (geometry?.type === "Point") shape = c.wkt.trim();
    else if (geometry) shape = `${label(`GeoShape.${geometry.type}`, geometry.type)} (${vertexCount(geometry)} ${label("GeoPoints", "points")})`;
    else shape = c.wkt.trim().split(/[\s(]/)[0] || "WKT";
    if (c.geoRelation === "withinDistance") {
      return `${geoRelationLabel(c.geoRelation)} ${(c.distance ?? 0) / 1000} km ${label("GeoOf", "of")} ${shape}`;
    }
    return `${geoRelationLabel(c.geoRelation)} ${shape}`;
  }

  parseInput(input: LabelledCriteria<Criteria>): LabelledCriteria<Criteria> {
    const c = input.criteria as GeoCriteria;
    if (!findGeoRelation(c.geoRelation) || !looksLikeWkt(c.wkt)) {
      throw Error(`Invalid geo criteria: ${JSON.stringify(c)}`);
    }
    if (c.geoRelation === "withinDistance" && !(c.distance >= 0)) {
      throw Error(`A distance criteria needs a distance: ${JSON.stringify(c)}`);
    }
    return input;
  }

  /**
   * Parses "relation|WKT" or "withinDistance|WKT|metres",
   * e.g. "withinDistance|POINT(4.35 50.85)|5000"
   */
  parseRawValue(raw: string): Criteria {
    const [relation, wkt, distance] = (raw ?? "").split("|").map((s) => s.trim());
    const criteria: GeoCriteria = { geoRelation: relation, wkt };
    if (distance) criteria.distance = Number(distance);
    this.parseInput({ label: "", criteria });
    return criteria;
  }

  // a WKT value is never a URI
  protected holdsUriValues(): boolean {
    return false;
  }
}

function vertexCount(g: SimpleGeometry): number {
  if (g.type === "Point") return 1;
  if (g.type === "LineString") return g.coordinates.length;
  return g.coordinates[0].length - 1;
}
