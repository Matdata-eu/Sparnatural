import { Parser, Pattern, SelectQuery } from "sparqljs";

/**
 * Turns a SPARQL graph pattern written as text into sparqljs patterns, so that
 * value builders can write readable SPARQL instead of assembling the AST by hand.
 * Use full IRIs, or the prefixes passed in.
 */
export class SparqlFragment {
  static parse(body: string, prefixes: { [prefix: string]: string } = {}): Pattern[] {
    const declarations = Object.entries(prefixes)
      .map(([p, ns]) => `PREFIX ${p}: <${ns}>`)
      .join("\n");
    const query = new Parser().parse(
      `${declarations}\nSELECT * WHERE {\n${body}\n}`,
    ) as SelectQuery;
    return query.where ?? [];
  }

  /**
   * @returns the SPARQL lexical form of a typed literal, quotes escaped
   */
  static literal(value: string, datatype: string): string {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"^^<${datatype}>`;
  }

  /**
   * @returns a decimal number in SPARQL syntax (no exponent, which would make it a double)
   */
  static decimal(n: number): string {
    if (!isFinite(n)) throw new Error(`Not a finite number: ${n}`);
    let s = n.toString();
    if (/e/i.test(s)) {
      s = n.toFixed(20).replace(/0+$/, "");
    }
    return s.includes(".") ? s.replace(/\.$/, ".0") : s + ".0";
  }
}
