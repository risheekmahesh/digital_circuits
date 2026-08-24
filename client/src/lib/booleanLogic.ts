/**
 * Circuit Atlas technical core — Boolean parsing, exact SOP minimisation,
 * synthesis of standard/NAND/NOR graphs, and exhaustive equivalence checks.
 */

export type Literal = { variable: string; negated: boolean };
export type ProductTerm = Literal[];
export type GateType = "INPUT" | "CONST" | "NOT" | "AND" | "OR" | "NAND" | "NOR" | "OUTPUT";

export type CircuitNode = {
  id: string;
  label: string;
  gate: GateType;
  inputs: string[];
  column: number;
};

export type CircuitGraph = {
  title: string;
  caption: string;
  nodes: CircuitNode[];
  outputId: string;
  variables: string[];
  expression: string;
};

export type VerificationRow = {
  index: number;
  assignment: Record<string, boolean>;
  original: boolean;
  dontCare: boolean;
  simplified: boolean;
  nand: boolean;
  nor: boolean;
  matches: boolean;
};

export type AnalysisResult = {
  variables: string[];
  values: boolean[];
  minterms: number[];
  maxterms: number[];
  dontCares: number[];
  originalExpression: string;
  simplifiedExpression: string;
  posExpression: string;
  sopTerms: ProductTerm[];
  posFactors: ProductTerm[];
  circuits: {
    standard: CircuitGraph;
    nand: CircuitGraph;
    nor: CircuitGraph;
  };
  verificationRows: VerificationRow[];
  isEquivalent: boolean;
};

type Ast =
  | { kind: "variable"; name: string }
  | { kind: "constant"; value: boolean }
  | { kind: "not"; value: Ast }
  | { kind: "and"; left: Ast; right: Ast }
  | { kind: "or"; left: Ast; right: Ast }
  | { kind: "xor"; left: Ast; right: Ast }
  | { kind: "xnor"; left: Ast; right: Ast };

type Implicant = { pattern: string; covered: Set<number> };

const VARIABLE_NAMES = ["A", "B", "C", "D", "E", "F"];

export function createVariables(count: number) {
  if (count < 1 || count > VARIABLE_NAMES.length) {
    throw new Error("Use between 1 and 6 input variables.");
  }
  return VARIABLE_NAMES.slice(0, count);
}

export function assignmentsFor(variables: string[]) {
  const count = 2 ** variables.length;
  return Array.from({ length: count }, (_, index) => {
    const assignment: Record<string, boolean> = {};
    variables.forEach((name, bit) => {
      assignment[name] = Boolean((index >> (variables.length - bit - 1)) & 1);
    });
    return assignment;
  });
}

const WORD_OPERATORS = new Set(["AND", "OR", "NOT", "XOR", "XNOR"]);

function isIdentifier(token: string) {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(token) && !WORD_OPERATORS.has(token.toUpperCase());
}

function tokenize(input: string) {
  const tokens: string[] = [];
  const matcher = /\s*(AND|XNOR|XOR|OR|NOT|[A-Za-z][A-Za-z0-9_]*|[01]|[()+*·&|^!~'])\s*/g;
  let index = 0;
  while (index < input.length) {
    matcher.lastIndex = index;
    const match = matcher.exec(input);
    if (!match || match.index !== index) {
      throw new Error(`Unexpected character near “${input.slice(index, index + 8)}”.`);
    }
    const raw = match[1];
    const normalized = WORD_OPERATORS.has(raw.toUpperCase()) ? raw.toUpperCase() : raw;
    if (/^[A-F]{2,}$/.test(normalized)) {
      normalized.split("").forEach((token) => tokens.push(token));
    } else {
      tokens.push(normalized);
    }
    index = matcher.lastIndex;
  }

  const canEnd = (token: string) => isIdentifier(token) || token === "0" || token === "1" || token === ")" || token === "'";
  const canStart = (token: string) => isIdentifier(token) || token === "0" || token === "1" || token === "(" || token === "!" || token === "~" || token === "NOT";
  const withImplicitAnd: string[] = [];
  tokens.forEach((token, position) => {
    if (position > 0 && canEnd(tokens[position - 1]) && canStart(token)) {
      withImplicitAnd.push("&");
    }
    withImplicitAnd.push(token);
  });
  return withImplicitAnd;
}

class ExpressionParser {
  private position = 0;

  constructor(private tokens: string[]) {}

  parse() {
    if (!this.tokens.length) throw new Error("Enter a Boolean expression first.");
    const expression = this.parseOr();
    if (this.position < this.tokens.length) {
      throw new Error(`Could not interpret “${this.tokens[this.position]}”.`);
    }
    return expression;
  }

  private peek() {
    return this.tokens[this.position];
  }

  private take() {
    return this.tokens[this.position++];
  }

  private parseOr(): Ast {
    let left = this.parseXor();
    while (this.peek() === "+" || this.peek() === "|" || this.peek() === "OR") {
      this.take();
      left = { kind: "or", left, right: this.parseXor() };
    }
    return left;
  }

  private parseXor(): Ast {
    let left = this.parseAnd();
    while (this.peek() === "^" || this.peek() === "XOR" || this.peek() === "XNOR") {
      const operator = this.take();
      const right = this.parseAnd();
      left = { kind: operator === "XNOR" ? "xnor" : "xor", left, right };
    }
    return left;
  }

  private parseAnd(): Ast {
    let left = this.parseUnary();
    while (this.peek() === "*" || this.peek() === "·" || this.peek() === "&" || this.peek() === "AND") {
      this.take();
      left = { kind: "and", left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Ast {
    if (this.peek() === "!" || this.peek() === "~" || this.peek() === "NOT") {
      this.take();
      return { kind: "not", value: this.parseUnary() };
    }
    let node = this.parsePrimary();
    while (this.peek() === "'") {
      this.take();
      node = { kind: "not", value: node };
    }
    return node;
  }

  private parsePrimary(): Ast {
    const token = this.take();
    if (token === "(") {
      const node = this.parseOr();
      if (this.take() !== ")") throw new Error("A closing parenthesis is missing.");
      return node;
    }
    if (token === "0" || token === "1") return { kind: "constant", value: token === "1" };
    if (token && isIdentifier(token)) return { kind: "variable", name: token.toUpperCase() };
    throw new Error("Expected a variable, 0, 1, or an opening parenthesis.");
  }
}

function evaluateAst(ast: Ast, assignment: Record<string, boolean>): boolean {
  switch (ast.kind) {
    case "variable":
      return assignment[ast.name] ?? false;
    case "constant":
      return ast.value;
    case "not":
      return !evaluateAst(ast.value, assignment);
    case "and":
      return evaluateAst(ast.left, assignment) && evaluateAst(ast.right, assignment);
    case "or":
      return evaluateAst(ast.left, assignment) || evaluateAst(ast.right, assignment);
    case "xor":
      return evaluateAst(ast.left, assignment) !== evaluateAst(ast.right, assignment);
    case "xnor":
      return evaluateAst(ast.left, assignment) === evaluateAst(ast.right, assignment);
  }
}

function collectVariables(ast: Ast, target = new Set<string>()) {
  if (ast.kind === "variable") target.add(ast.name);
  if (ast.kind === "not") collectVariables(ast.value, target);
  if (ast.kind === "and" || ast.kind === "or" || ast.kind === "xor" || ast.kind === "xnor") {
    collectVariables(ast.left, target);
    collectVariables(ast.right, target);
  }
  return target;
}

export function parseBooleanExpression(input: string, explicitVariables?: string[]) {
  const ast = new ExpressionParser(tokenize(input)).parse();
  const inferredVariables = Array.from(collectVariables(ast)).sort((a, b) => a.localeCompare(b));
  const variables = (explicitVariables?.length ? explicitVariables : inferredVariables).map((name) => name.trim().toUpperCase());
  if (variables.length < 1) throw new Error("Use at least one named input variable.");
  if (variables.length > 6) throw new Error("This lab supports up to 6 input variables.");
  if (new Set(variables).size !== variables.length) throw new Error("Variable names must be unique.");
  if (!variables.every((name) => /^[A-Z][A-Z0-9_]{0,2}$/.test(name))) throw new Error("Variable names must begin with a letter and contain up to 3 letters, numbers, or underscores.");
  const undeclared = inferredVariables.filter((name) => !variables.includes(name));
  if (undeclared.length) throw new Error(`Expression uses undeclared variable(s): ${undeclared.join(", ")}. Add them to the variable definition panel.`);
  const values = assignmentsFor(variables).map((assignment) => evaluateAst(ast, assignment));
  return { variables, values };
}

function patternFor(index: number, width: number) {
  return index.toString(2).padStart(width, "0");
}

function mergePatterns(left: string, right: string) {
  let differences = 0;
  let merged = "";
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) {
      merged += left[index];
      continue;
    }
    if (left[index] === "-" || right[index] === "-") return null;
    differences += 1;
    merged += "-";
  }
  return differences === 1 ? merged : null;
}

function mergeCoverage(left: Set<number>, right: Set<number>) {
  return new Set([...Array.from(left), ...Array.from(right)]);
}

function literalCount(implicant: Implicant) {
  return implicant.pattern.split("").filter((bit) => bit !== "-").length;
}

function minimiseSop(variables: string[], minterms: number[], dontCares: number[] = []): ProductTerm[] {
  const universe = 2 ** variables.length;
  const required = Array.from(new Set(minterms)).sort((a, b) => a - b);
  const allowed = Array.from(new Set([...required, ...dontCares])).sort((a, b) => a - b);
  if (required.length === 0) return [];
  if (required.length === universe) return [[]];

  let current: Implicant[] = allowed.map((minterm) => ({ pattern: patternFor(minterm, variables.length), covered: new Set([minterm]) }));
  const primeMap = new Map<string, Implicant>();

  while (current.length) {
    const combined = new Set<number>();
    const nextMap = new Map<string, Implicant>();
    for (let left = 0; left < current.length; left += 1) {
      for (let right = left + 1; right < current.length; right += 1) {
        const pattern = mergePatterns(current[left].pattern, current[right].pattern);
        if (!pattern) continue;
        combined.add(left);
        combined.add(right);
        const existing = nextMap.get(pattern);
        const coverage = existing ? mergeCoverage(existing.covered, current[left].covered) : mergeCoverage(current[left].covered, current[right].covered);
        nextMap.set(pattern, { pattern, covered: existing ? mergeCoverage(coverage, current[right].covered) : coverage });
      }
    }
    current.forEach((implicant, index) => {
      if (!combined.has(index)) primeMap.set(implicant.pattern, implicant);
    });
    current = Array.from(nextMap.values());
  }

  const primes = Array.from(primeMap.values()).filter((prime) => required.some((term) => prime.covered.has(term)));
  const coverageMap = new Map<number, number[]>();
  required.forEach((minterm) => coverageMap.set(minterm, primes.flatMap((prime, index) => (prime.covered.has(minterm) ? [index] : []))));

  const essential = new Set<number>();
  coverageMap.forEach((candidates) => {
    if (candidates.length === 1) essential.add(candidates[0]);
  });

  const coveredBy = (indices: Set<number>) => {
    const covered = new Set<number>();
    indices.forEach((primeIndex) => primes[primeIndex].covered.forEach((term) => covered.add(term)));
    return covered;
  };

  let best: number[] | null = null;
  const compare = (candidate: number[], currentBest: number[] | null) => {
    if (!currentBest) return true;
    if (candidate.length !== currentBest.length) return candidate.length < currentBest.length;
    const candidateLiterals = candidate.reduce((total, item) => total + literalCount(primes[item]), 0);
    const bestLiterals = currentBest.reduce((total, item) => total + literalCount(primes[item]), 0);
    if (candidateLiterals !== bestLiterals) return candidateLiterals < bestLiterals;
    return candidate.map((item) => primes[item].pattern).join("|") < currentBest.map((item) => primes[item].pattern).join("|");
  };

  const search = (selected: Set<number>) => {
    const covered = coveredBy(selected);
    const missing = required.filter((term) => !covered.has(term));
    if (missing.length === 0) {
      const candidate = Array.from(selected).sort((a, b) => a - b);
      if (compare(candidate, best)) best = candidate;
      return;
    }
    if (best && selected.size >= best.length) return;
    const pivot = [...missing].sort((a, b) => (coverageMap.get(a)?.length ?? 0) - (coverageMap.get(b)?.length ?? 0))[0];
    const candidates = (coverageMap.get(pivot) ?? []).filter((item) => !selected.has(item)).sort((a, b) => literalCount(primes[a]) - literalCount(primes[b]));
    candidates.forEach((candidate) => {
      const next = new Set(selected);
      next.add(candidate);
      search(next);
    });
  };

  search(essential);
  const selected = best ?? Array.from(essential);
  return selected
    .map((index) => primes[index].pattern)
    .sort((left, right) => left.localeCompare(right))
    .map((pattern) =>
      pattern.split("").flatMap((bit, index) => (bit === "-" ? [] : [{ variable: variables[index], negated: bit === "0" }])),
    );
}

export function formatLiteral(literal: Literal) {
  return `${literal.variable}${literal.negated ? "'" : ""}`;
}

export function formatSop(terms: ProductTerm[]) {
  if (terms.length === 0) return "0";
  if (terms.some((term) => term.length === 0)) return "1";
  return terms.map((term) => term.map(formatLiteral).join("·")).join(" + ");
}

export function formatPos(factors: ProductTerm[]) {
  if (factors.length === 0) return "1";
  if (factors.some((factor) => factor.length === 0)) return "0";
  return factors.map((factor) => `(${factor.map(formatLiteral).join(" + ")})`).join("·");
}

function evaluateSop(terms: ProductTerm[], assignment: Record<string, boolean>) {
  if (terms.length === 0) return false;
  return terms.some((term) => term.every((literal) => (literal.negated ? !assignment[literal.variable] : assignment[literal.variable])));
}

function node(id: string, label: string, gate: GateType, inputs: string[], column: number): CircuitNode {
  return { id, label, gate, inputs, column };
}

type GraphRef = { id: string; column: number };

function finishGraph(title: string, caption: string, variables: string[], nodes: CircuitNode[], source: string, expression: string): CircuitGraph {
  const outputId = "output";
  const outputColumn = Math.max(...nodes.map((current) => current.column), 3) + 1;
  nodes.push(node(outputId, "F", "OUTPUT", [source], outputColumn));
  return { title, caption, nodes, outputId, variables, expression };
}

function binaryChain(nodes: CircuitNode[], gate: "AND" | "OR", sources: string[], prefix: string, startColumn: number): GraphRef {
  if (sources.length === 1) return { id: sources[0], column: startColumn - 1 };
  let current = sources[0];
  let column = startColumn;
  for (let index = 1; index < sources.length; index += 1) {
    const id = `${prefix}-${index}`;
    nodes.push(node(id, gate, gate, [current, sources[index]], column));
    current = id;
    column += 1;
  }
  return { id: current, column: column - 1 };
}

function binaryNegatedChain(nodes: CircuitNode[], gate: "NAND" | "NOR", sources: string[], prefix: string, startColumn: number): GraphRef {
  if (sources.length === 1) {
    const id = `${prefix}-invert`;
    nodes.push(node(id, gate, gate, [sources[0], sources[0]], startColumn));
    return { id, column: startColumn };
  }
  let current = `${prefix}-0`;
  let column = startColumn;
  nodes.push(node(current, gate, gate, [sources[0], sources[1]], column));
  for (let index = 2; index < sources.length; index += 1) {
    column += 1;
    const restored = `${prefix}-restore-${index}`;
    nodes.push(node(restored, gate, gate, [current, current], column));
    column += 1;
    current = `${prefix}-${index}`;
    nodes.push(node(current, gate, gate, [restored, sources[index]], column));
  }
  return { id: current, column };
}

function combineNandNegated(nodes: CircuitNode[], sources: string[], prefix: string, startColumn: number): GraphRef {
  if (sources.length === 1) return binaryNegatedChain(nodes, "NAND", sources, prefix, startColumn);
  let current = `${prefix}-0`;
  let column = startColumn;
  nodes.push(node(current, "NAND", "NAND", [sources[0], sources[1]], column));
  for (let index = 2; index < sources.length; index += 1) {
    column += 1;
    const restored = `${prefix}-restore-${index}`;
    nodes.push(node(restored, "NAND", "NAND", [current, current], column));
    column += 1;
    current = `${prefix}-${index}`;
    nodes.push(node(current, "NAND", "NAND", [restored, sources[index]], column));
  }
  return { id: current, column };
}

function combineNorNegated(nodes: CircuitNode[], sources: string[], prefix: string, startColumn: number): GraphRef {
  if (sources.length === 1) return binaryNegatedChain(nodes, "NOR", sources, prefix, startColumn);
  let current = `${prefix}-0`;
  let column = startColumn;
  nodes.push(node(current, "NOR", "NOR", [sources[0], sources[1]], column));
  for (let index = 2; index < sources.length; index += 1) {
    column += 1;
    const restored = `${prefix}-restore-${index}`;
    nodes.push(node(restored, "NOR", "NOR", [current, current], column));
    column += 1;
    current = `${prefix}-${index}`;
    nodes.push(node(current, "NOR", "NOR", [restored, sources[index]], column));
  }
  return { id: current, column };
}

function standardGraph(variables: string[], terms: ProductTerm[], expression: string): CircuitGraph {
  const nodes = variables.map((variable) => node(`in-${variable}`, variable, "INPUT", [], 0));
  if (terms.length === 0 || terms.some((term) => term.length === 0)) {
    const value = terms.length > 0;
    nodes.push(node("const", value ? "1" : "0", "CONST", [], 2));
    return finishGraph("AND · OR · NOT", "Simplified sum-of-products implementation using basic gates.", variables, nodes, "const", expression);
  }
  const inverted = new Map<string, string>();
  const literalSource = (literal: Literal) => {
    const input = `in-${literal.variable}`;
    if (!literal.negated) return input;
    const cached = inverted.get(literal.variable);
    if (cached) return cached;
    const id = `not-${literal.variable}`;
    nodes.push(node(id, "NOT", "NOT", [input], 1));
    inverted.set(literal.variable, id);
    return id;
  };
  const products = terms.map((term, index) => binaryChain(nodes, "AND", term.map(literalSource), `and-${index}`, 2));
  const source = products.length === 1 ? products[0].id : binaryChain(nodes, "OR", products.map((product) => product.id), "or-final", Math.max(...products.map((product) => product.column), 2) + 1).id;
  return finishGraph("AND · OR · NOT", "Simplified sum-of-products implementation using basic gates.", variables, nodes, source, expression);
}

function nandGraph(variables: string[], terms: ProductTerm[], expression: string): CircuitGraph {
  const nodes = variables.map((variable) => node(`in-${variable}`, variable, "INPUT", [], 0));
  if (terms.length === 0 || terms.some((term) => term.length === 0)) {
    const value = terms.length > 0;
    nodes.push(node("const", value ? "1" : "0", "CONST", [], 2));
    return finishGraph("NAND-only", "A constant output is shown directly; non-constant functions use NAND gates only.", variables, nodes, "const", value ? "1" : "0");
  }
  const inverted = new Map<string, string>();
  const literalSource = (literal: Literal) => {
    const input = `in-${literal.variable}`;
    if (!literal.negated) return input;
    const cached = inverted.get(literal.variable);
    if (cached) return cached;
    const id = `nand-inv-${literal.variable}`;
    nodes.push(node(id, "NAND", "NAND", [input, input], 1));
    inverted.set(literal.variable, id);
    return id;
  };
  const negatedProducts = terms.map((term, index) => binaryNegatedChain(nodes, "NAND", term.map(literalSource), `nand-product-${index}`, 2));
  const final = combineNandNegated(nodes, negatedProducts.map((product) => product.id), "nand-final", Math.max(...negatedProducts.map((product) => product.column), 2) + 1);
  return finishGraph("NAND-only", "Inverters and the final OR transformation are synthesized with NAND gates.", variables, nodes, final.id, expression);
}

function norGraph(variables: string[], factors: ProductTerm[], expression: string): CircuitGraph {
  const nodes = variables.map((variable) => node(`in-${variable}`, variable, "INPUT", [], 0));
  if (factors.length === 0 || factors.some((factor) => factor.length === 0)) {
    const value = factors.length === 0;
    nodes.push(node("const", value ? "1" : "0", "CONST", [], 2));
    return finishGraph("NOR-only", "A constant output is shown directly; non-constant functions use NOR gates only.", variables, nodes, "const", value ? "1" : "0");
  }
  const inverted = new Map<string, string>();
  const literalSource = (literal: Literal) => {
    const input = `in-${literal.variable}`;
    if (!literal.negated) return input;
    const cached = inverted.get(literal.variable);
    if (cached) return cached;
    const id = `nor-inv-${literal.variable}`;
    nodes.push(node(id, "NOR", "NOR", [input, input], 1));
    inverted.set(literal.variable, id);
    return id;
  };
  const negatedFactors = factors.map((factor, index) => binaryNegatedChain(nodes, "NOR", factor.map(literalSource), `nor-factor-${index}`, 2));
  const final = combineNorNegated(nodes, negatedFactors.map((factor) => factor.id), "nor-final", Math.max(...negatedFactors.map((factor) => factor.column), 2) + 1);
  return finishGraph("NOR-only", "The minimized product-of-sums form is synthesized exclusively with NOR gates.", variables, nodes, final.id, expression);
}

export function evaluateCircuit(graph: CircuitGraph, assignment: Record<string, boolean>) {
  const values = new Map<string, boolean>();
  graph.nodes.forEach((current) => {
    const inputs = current.inputs.map((id) => values.get(id) ?? false);
    switch (current.gate) {
      case "INPUT":
        values.set(current.id, assignment[current.label] ?? false);
        break;
      case "CONST":
        values.set(current.id, current.label === "1");
        break;
      case "NOT":
        values.set(current.id, !inputs[0]);
        break;
      case "AND":
        values.set(current.id, inputs.every(Boolean));
        break;
      case "OR":
        values.set(current.id, inputs.some(Boolean));
        break;
      case "NAND":
        values.set(current.id, !inputs.every(Boolean));
        break;
      case "NOR":
        values.set(current.id, !inputs.some(Boolean));
        break;
      case "OUTPUT":
        values.set(current.id, inputs[0] ?? false);
        break;
    }
  });
  return values.get(graph.outputId) ?? false;
}

export function parseIndexList(input: string, limit: number) {
  const cleaned = input.trim();
  if (!cleaned) return [];
  const values = cleaned.split(/[\s,]+/).map((entry) => Number(entry));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value >= limit)) {
    throw new Error(`Use comma-separated whole numbers from 0 to ${limit - 1}.`);
  }
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function parseDontCareList(input: string, limit: number) {
  const cleaned = input.trim();
  if (!cleaned) return [];
  const wrapped = cleaned.match(/^d\s*\((.*)\)$/i);
  const body = wrapped ? wrapped[1].trim() : cleaned;
  if (!body || /[()d]/i.test(body) || !/^\d+(?:\s*,\s*\d+)*$/.test(body)) {
    throw new Error(`Enter don't-care terms as d(1,3,7) or 1,3,7 using values from 0 to ${limit - 1}.`);
  }
  return parseIndexList(body, limit);
}

export function valuesFromTerms(count: number, values: number[], kind: "minterms" | "maxterms") {
  const selected = new Set(values);
  return Array.from({ length: 2 ** count }, (_, index) => (kind === "minterms" ? selected.has(index) : !selected.has(index)));
}

export function analyzeFromValues(variables: string[], values: boolean[], originalExpression?: string, dontCares: number[] = []): AnalysisResult {
  const assignments = assignmentsFor(variables);
  if (values.length !== assignments.length) throw new Error("The truth table does not match the selected variable count.");
  const limit = assignments.length;
  const normalizedDontCares = Array.from(new Set(dontCares)).sort((a, b) => a - b);
  if (normalizedDontCares.some((index) => !Number.isInteger(index) || index < 0 || index >= limit)) {
    throw new Error(`Don't-care terms must be whole numbers from 0 to ${limit - 1}.`);
  }
  const minterms = values.flatMap((value, index) => (value ? [index] : []));
  if (normalizedDontCares.some((index) => minterms.includes(index))) {
    throw new Error("Don't-care terms cannot overlap with required ON-set minterms.");
  }
  const dontCareSet = new Set(normalizedDontCares);
  const maxterms = values.flatMap((value, index) => (!value && !dontCareSet.has(index) ? [index] : []));
  const sopTerms = minimiseSop(variables, minterms, normalizedDontCares);
  const complementTerms = minimiseSop(variables, maxterms, normalizedDontCares);
  const posFactors = complementTerms.map((term) => term.map((literal) => ({ ...literal, negated: !literal.negated })));
  const simplifiedExpression = formatSop(sopTerms);
  const posExpression = formatPos(posFactors);
  const canonical = formatSop(
    minterms.map((index) =>
      variables.map((variable, bit) => ({ variable, negated: !Boolean((index >> (variables.length - bit - 1)) & 1) })),
    ),
  );
  const circuits = {
    standard: standardGraph(variables, sopTerms, simplifiedExpression),
    nand: nandGraph(variables, sopTerms, simplifiedExpression),
    nor: norGraph(variables, posFactors, posExpression),
  };
  const verificationRows = assignments.map((assignment, index) => {
    const original = values[index];
    const dontCare = dontCareSet.has(index);
    const simplified = evaluateSop(sopTerms, assignment);
    const nand = evaluateCircuit(circuits.nand, assignment);
    const nor = evaluateCircuit(circuits.nor, assignment);
    const matches = dontCare || (original === simplified && original === nand && original === nor);
    return { index, assignment, original, dontCare, simplified, nand, nor, matches };
  });
  return {
    variables,
    values,
    minterms,
    maxterms,
    dontCares: normalizedDontCares,
    originalExpression: originalExpression?.trim() || canonical,
    simplifiedExpression,
    posExpression,
    sopTerms,
    posFactors,
    circuits,
    verificationRows,
    isEquivalent: verificationRows.every((row) => row.matches),
  };
}
