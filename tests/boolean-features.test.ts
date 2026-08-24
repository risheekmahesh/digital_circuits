import { describe, expect, it } from "vitest";
import { analyzeFromValues, createVariables, parseBooleanExpression, parseDontCareList, valuesFromTerms } from "../client/src/lib/booleanLogic";

describe("Boolean expression feature syntax", () => {
  it("supports word AND and OR operators", () => {
    expect(parseBooleanExpression("A AND B OR C").variables).toEqual(["A", "B", "C"]);
    expect(parseBooleanExpression("A AND B").values).toEqual([false, false, false, true]);
  });

  it("supports NOT, XOR, XNOR, and caret XOR", () => {
    expect(parseBooleanExpression("NOT A").values).toEqual([true, false]);
    expect(parseBooleanExpression("A XOR B").values).toEqual([false, true, true, false]);
    expect(parseBooleanExpression("A XNOR B").values).toEqual([true, false, false, true]);
    expect(parseBooleanExpression("A^B").values).toEqual([false, true, true, false]);
  });

  it("preserves legacy adjacency syntax", () => {
    expect(parseBooleanExpression("A'B + AB' + AC").variables).toEqual(["A", "B", "C"]);
  });

  it("supports custom identifiers with digits and underscores", () => {
    expect(parseBooleanExpression("EN AND X1").variables).toEqual(["EN", "X1"]);
  });

  it("evaluates an expression across an explicit variable definition", () => {
    const parsed = parseBooleanExpression("A XOR B", ["A", "B", "C", "D"]);
    expect(parsed.variables).toEqual(["A", "B", "C", "D"]);
    expect(parsed.values).toHaveLength(16);
    expect(parsed.values[5]).toBe(true);
  });

  it("rejects an expression variable omitted from the definition", () => {
    expect(() => parseBooleanExpression("A AND C", ["A", "B"])).toThrow(/undeclared/i);
  });
});

describe("Boolean input contracts", () => {
  it("parses and deduplicates dont-care lists", () => {
    expect(parseDontCareList("d(1, 3, 1, 7)", 8)).toEqual([1, 3, 7]);
  });

  it("rejects invalid dont-care syntax and overlap", () => {
    expect(() => parseDontCareList("1,a", 8)).toThrow();
    expect(() => analyzeFromValues(createVariables(3), valuesFromTerms(3, [1, 3], "minterms"), "Σm(1,3)", [3])).toThrow(/overlap/i);
  });

  it("uses dont-care states during simplification", () => {
    const result = analyzeFromValues(createVariables(3), valuesFromTerms(3, [1, 3], "minterms"), "Σm(1,3), d(7)", [7]);
    expect(result.dontCares).toEqual([7]);
    expect(result.verificationRows.find((row) => row.index === 7)?.dontCare).toBe(true);
  });

  it("supports six-variable truth spaces", () => {
    const result = analyzeFromValues(createVariables(6), Array.from({ length: 64 }, (_, index) => index === 63), "F");
    expect(result.verificationRows).toHaveLength(64);
    expect(result.isEquivalent).toBe(true);
  });
});
