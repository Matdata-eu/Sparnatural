import * as fs from "fs";
import * as path from "path";
import { Parser as N3Parser, Store } from "n3";
import { Generator, SelectQuery } from "sparqljs";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { JsonV13SparqlTranslator } from "../../sparnatural/generators/sparql/fromjsonv13/JsonV13SparqlTranslator";
import { SparnaturalSpecificationFactory } from "../../sparnatural/spec-providers/SparnaturalSpecificationFactory";
import { LabelledFilter, SparnaturalQuery } from "../../sparnatural/SparnaturalQueryIfc-v13";

export const FIXTURES = path.join(__dirname, "../../../dev-page/configs/semantic-widgets");
export const CONFIG_NS = "https://example.org/sparnatural-test/config/";
export const DATA_NS = "https://example.org/sparnatural-test/";

export async function buildSpecProvider(configTtl?: string): Promise<any> {
  const ttl = configTtl ?? fs.readFileSync(path.join(FIXTURES, "config.ttl"), "utf-8");
  return new Promise<any>((resolve) =>
    new SparnaturalSpecificationFactory().build(ttl, "en", undefined, (p: any) => resolve(p)),
  );
}

export function loadData(file = "data.ttl"): Store {
  const store = new Store();
  store.addQuads(new N3Parser().parse(fs.readFileSync(path.join(FIXTURES, file), "utf-8")));
  return store;
}

/**
 * A one-criteria query : <subjectShape> <propertyShape> <objectType>, both variables selected
 */
export function oneCriteriaQuery(
  subjectShape: string,
  propertyShape: string,
  objectType: string,
  filters?: LabelledFilter[],
): SparnaturalQuery {
  return {
    type: "query",
    subType: "SELECT",
    distinct: true,
    variables: [
      { type: "term", subType: "variable", value: "s" },
      { type: "term", subType: "variable", value: "o" },
    ],
    solutionModifiers: {},
    where: {
      type: "pattern",
      subType: "bgpSameSubject",
      subject: { type: "term", subType: "variable", value: "s", rdfType: CONFIG_NS + subjectShape },
      predicateObjectPairs: [
        {
          type: "predicateObjectPair",
          predicate: { type: "term", subType: "namedNode", value: CONFIG_NS + propertyShape },
          object: {
            type: "objectCriteria",
            variable: { type: "term", subType: "variable", value: "o", rdfType: objectType },
            filters,
          },
        },
      ],
    },
  } as SparnaturalQuery;
}

export function toSparql(specProvider: any, query: SparnaturalQuery): string {
  const translator = new JsonV13SparqlTranslator(specProvider, { language: "en", addDistinct: true, limit: -1 });
  const generated = new Generator().stringify(translator.generateQuery(query) as SelectQuery);
  return specProvider.expandSparql(generated, {});
}

/**
 * @returns the local names of the subjects, and the values of ?o, found by the query
 */
export async function run(store: Store, sparql: string): Promise<{ s: string[]; rows: { s: string; o?: string }[] }> {
  const engine = new QueryEngine();
  const bindings = await (await engine.queryBindings(sparql, { sources: [store] })).toArray();
  const local = (iri: string) => iri.substring(DATA_NS.length);
  const rows = bindings.map((b) => ({ s: local(b.get("s")!.value), o: b.get("o")?.value }));
  return { s: [...new Set(rows.map((r) => r.s))].sort(), rows };
}
