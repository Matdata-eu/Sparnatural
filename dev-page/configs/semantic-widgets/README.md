# Semantic widgets test fixtures

Synthetic data and a demo SHACL config for the OWL-Time, GeoSPARQL and QUDT
widgets. In the config, each property shape points only at the intermediate
node (`time:TemporalEntity`, `gsp:Geometry`, `qudt:QuantityValue`). The widget
then follows the value path to the literal on its own.

| File | Content |
| --- | --- |
| `config.ttl` | Sparnatural SHACL config: Event, Place, Sample |
| `data.ttl` | 19 events, 12 places, 9 samples, one data pattern or edge case each |

`config.ttl` uses the config terms added with the widgets (`core:OwlTimeProperty`,
`core:defaultUnit`, `core:unitConversion`), described in
`ontologies/sparnatural-config-core.owl` and in `docs/widgets.md`.

The expected results below are the reference for the widget tests. The time
and QUDT rows were checked by running SPARQL 1.1 queries over `data.ttl` with
rdflib. Two exceptions were checked by hand: the `DateTimeDescription` events
(marked \*) and foundationOfRome, because rdflib cannot cast BC dates. The
geometry rows were checked with Shapely and a haversine distance.

## OWL-Time

Reference period: the year 2020, i.e. `[2020-01-01T00:00:00Z, 2021-01-01T00:00:00Z)`.

| Relation | Expected events |
| --- | --- |
| within (inclusive: during, starts, finishes or equals) | coronation, culturalCapitalYear, europeDay\*, firstBroadcast, harbourOpening, marchCampaign\*, springSeason, summerSchool, treatySigned |
| intersects | the "within" list + renovationCampaign, restorationProject, touringExhibition, winterFestival |
| before (`time:before`) | decadeReview, foundationOfRome, satelliteLaunch |
| after (`time:after`) | censusDay |
| `time:intervalBefore` | foundationOfRome, satelliteLaunch |
| `time:intervalMeets` | decadeReview |
| `time:intervalMetBy` | censusDay |
| `time:intervalOverlaps` | winterFestival |
| `time:intervalOverlappedBy` | touringExhibition |
| `time:intervalStarts` | springSeason |
| `time:intervalStartedBy` | none |
| `time:intervalDuring` | europeDay\*, firstBroadcast, marchCampaign\*, summerSchool, treatySigned |
| `time:intervalContains` | renovationCampaign, restorationProject (open interval) |
| `time:intervalFinishes` | harbourOpening |
| `time:intervalFinishedBy` | none |
| `time:intervalEquals` | coronation, culturalCapitalYear |
| `time:intervalAfter` | none |
| `time:intervalIn` (within, but not equal) | europeDay\*, firstBroadcast, harbourOpening, marchCampaign\*, springSeason, summerSchool, treatySigned |
| `time:intervalDisjoint` | censusDay, decadeReview, foundationOfRome, satelliteLaunch |

The tests in `src/__tests__/semantic/OwlTime.test.ts` run these queries with
Comunica, which cannot compare BC dates: foundationOfRome is left out there.

Never matched by any time filter: iceAgePeak (`time:inTimePosition`, deferred)
and undatedGathering (no time).

\* `time:DateTimeDescription` patterns (`inDateTime`, `hasDateTimeDescription`).

## GeoSPARQL

| Query | Expected places |
| --- | --- |
| within 5 km of `POINT(4.3522 50.8467)` (Grand-Place) | grandPlace, royalPalace, midiStation, pentagon, northSouthJunction, cinquantenaire, parcDuCinquantenaire, boisDeLaCambre |
| `sfWithin` the Pentagon polygon | grandPlace, royalPalace, pentagon |
| `sfIntersects` the Pentagon polygon | grandPlace, royalPalace, pentagon, northSouthJunction |
| `sfCrosses` the Pentagon polygon | northSouthJunction |
| `sfWithin` box `POLYGON((4.33 50.83, 4.40 50.83, 4.40 50.86, 4.33 50.86, 4.33 50.83))` | grandPlace, royalPalace, midiStation, pentagon, northSouthJunction, cinquantenaire, parcDuCinquantenaire |

`src/__tests__/semantic/GeoSparql.test.ts` runs these queries with Comunica,
which has no GeoSPARQL functions: the test plugs in a small planar implementation
of the `geof:` functions it needs (`GeoTestFunctions.ts`).

Edge cases: atomium is 5.41 km away, just outside the 5 km radius.
antwerpCathedral is about 42 km away. cinquantenaire uses an EPSG:4326 CRS
IRI with latitude-longitude order. parcDuCinquantenaire has a default
geometry and a second, detailed one. placeFlagey has only `gsp:asGeoJSON`
and unknownVenue has no geometry, so neither ever matches.

## QUDT

| Query | Expected samples |
| --- | --- |
| mass >= 2 kg | sampleA (2500 g), sampleC (5 lb), sampleD (0.003 t), sampleF (2 kg), sampleG (4.409... lb) |
| mass = 2 kg | sampleF, sampleG (equal within 1e-9 after conversion) |
| storage temperature <= -18 °C | sampleA (-20 °C), sampleD (253.15 K), sampleE (-80 °C) |

Conversion follows the QUDT 3 convention, value in SI = (value + conversionOffset) ×
conversionMultiplier (`unit:DEG_F` has offset 459.67). The bundled unit table
(`src/sparnatural/semantic/quantity/qudt-units.json`) is built from QUDT v3.5.3 by
`node scripts/build-qudt-units.mjs v3.5.3`. The endpoint mode test loads the QUDT
description of the temperature units from that table.

Edge cases: sampleF at 0 °F is -17.78 °C, so it fails the temperature filter
only if the conversion offset is applied. sampleH records a mass in metres
and must never match. sampleD uses the older `qudt:value` and `qudt:hasUnit`.
sampleE wraps its mass in a `qudt:Quantity`. sampleI has no measurements.
