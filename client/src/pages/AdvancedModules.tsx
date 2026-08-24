import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calculator, Check, CircuitBoard, Download, GitBranch, Info, Pause, Play, Plus, RefreshCw, RotateCcw } from "lucide-react";
import {
  Bit,
  bitString,
  bitsFromNumber,
  decimalFromBits,
  numberFromBits,
  rippleAdd,
  twosComplementSubtract,
  fullAdder,
  fullAdderTruthTable,
  fullSubtractor,
  fullSubtractorTruthTable,
  halfAdder,
  halfAdderTruthTable,
  halfSubtractor,
  halfSubtractorTruthTable,
  multiplyThreeBitNumbers,
  multiplyTwoBitNumbers,
  multiplierTruthTable,
  threeBitMultiplierTruthTable,
} from "@/lib/advancedCircuits";

const bitValue = (value: Bit) => (value ? "1" : "0");

type GateKind = "AND" | "OR" | "XOR" | "NOT";
type SignalSource = "a" | "b" | "c" | "a0" | "a1" | "a2" | "b0" | "b1" | "b2" | "derived";
type TruthRow = { inputs: Bit[]; outputs: Bit[] };

type TerminalProps = {
  x: number;
  y: number;
  label: string;
  value: Bit;
  kind?: "input" | "output";
  source?: SignalSource;
};

function Terminal({ x, y, label, value, kind = "input", source }: TerminalProps) {
  const width = kind === "output" ? 118 : 76;
  return <g className={`module-terminal terminal-${kind} ${source ? `terminal-source-${source}` : ""}`}>
    <rect x={x} y={y - 17} width={width} height={34} rx="7" />
    <text className="module-terminal-key" x={x + 14} y={y + 4}>{label}</text>
    <text className="module-terminal-value" x={x + width - 14} y={y + 4} textAnchor="end">{bitValue(value)}</text>
  </g>;
}

function BitToggle({ label, value, onChange }: { label: string; value: Bit; onChange: (value: Bit) => void }) {
  return <button type="button" className={`bit-toggle ${value ? "on" : ""}`} aria-pressed={value === 1} onClick={() => onChange(value ? 0 : 1)}>
    <span>{label}</span><strong>{bitValue(value)}</strong>
  </button>;
}

function Lamp({ label, value }: { label: string; value: Bit }) {
  return <div className={`output-lamp ${value ? "on" : ""}`}><span>{label}</span><strong>{bitValue(value)}</strong></div>;
}

function TruthTable({ headers, rows, activeInputs }: { headers: string[]; rows: TruthRow[]; activeInputs?: Bit[] }) {
  return <div className="module-table-wrap">
    <table className="module-table">
      <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const isCurrent = Boolean(activeInputs && row.inputs.every((value, inputIndex) => value === activeInputs[inputIndex]));
        return <tr className={isCurrent ? "is-current" : ""} key={index}>
          {row.inputs.map((value, inputIndex) => <td key={`i-${inputIndex}`}>{bitValue(value)}</td>)}
          {row.outputs.map((value, outputIndex) => <td className="module-output-cell" key={`o-${outputIndex}`}>{bitValue(value)}</td>)}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function ScaleControl({ scale, onChange, onReset, onExport }: { scale: number; onChange: (value: number) => void; onReset: () => void; onExport: () => void }) {
  const update = (value: number) => onChange(Math.min(2.5, Math.max(0.4, Math.round(value * 10) / 10)));
  return <div className="circuit-scale-control" aria-label="Circuit scale control">
    <span>CIRCUIT SCALE</span><button type="button" onClick={() => update(scale - 0.1)} aria-label="Decrease circuit scale">−</button>
    <input aria-label="Circuit scale" type="range" min="0.4" max="2.5" step="0.1" value={scale} onChange={(event) => update(Number(event.target.value))} />
    <button type="button" onClick={() => update(scale + 0.1)} aria-label="Increase circuit scale">+</button><output>{Math.round(scale * 100)}%</output>
    <button type="button" className="circuit-tool-button" onClick={onReset} aria-label="Reset circuit view"><RotateCcw size={13} /></button>
    <button type="button" className="circuit-tool-button" onClick={onExport} aria-label="Export SVG"><Download size={13} /></button>
  </div>;
}

function gatePath(gate: GateKind, width = 98, height = 56) {
  const mid = height / 2;
  if (gate === "AND") return `M 0 8 H ${width - 45} A 28 ${mid - 2} 0 0 1 ${width - 45} ${height - 8} H 0 Z`;
  if (gate === "NOT") return `M 0 8 L ${width - 18} ${mid} L 0 ${height - 8} Z`;
  return `M 0 8 Q 22 ${mid} 0 ${height - 8} Q ${width - 35} ${height - 4} ${width - 4} ${mid} Q ${width - 35} 4 0 8 Z`;
}

function Gate({ x, y, label, active = 0, inputs = 2 }: { x: number; y: number; label: GateKind; active?: Bit; inputs?: 1 | 2 | 3 }) {
  const isXor = label === "XOR";
  const isNot = label === "NOT";
  const inputYs = inputs === 1 ? [28] : inputs === 3 ? [14, 28, 42] : [20, 36];
  const outputX = isNot ? 80 : 98;
  return <g className={`module-gate gate-${label.toLowerCase()} ${active ? "is-active" : ""}`} transform={`translate(${x}, ${y})`}>
    {isXor && <path className="module-gate-xor-line" d="M -9 8 Q 14 28 -9 48" />}
    <path className="module-gate-body" d={gatePath(label)} />
    {isNot && <circle className="module-gate-bubble" cx="80" cy="28" r="6" />}
    <text x={label === "NOT" ? 35 : 49} y="33" textAnchor="middle">{label}</text>
    {inputYs.map((inputY) => <circle className="module-gate-input-pin" key={inputY} cx="0" cy={inputY} r="3" />)}
    <circle className="module-gate-output-pin" cx={outputX} cy="28" r="3" />
  </g>;
}

function Wire({ d, source = "derived", value }: { d: string; source?: SignalSource; value?: Bit }) {
  return <path className={`module-wire wire-${source} ${value ? "is-high" : "is-low"}`} d={d} />;
}

function AdderBlock({ x, y, kind, sum, carry, highlighted = false }: { x: number; y: number; kind: "HA" | "FA"; sum: Bit; carry: Bit; highlighted?: boolean }) {
  const inputYs = kind === "FA" ? [16, 32, 48] : [20, 44];
  return <g className={`module-adder-block adder-${kind.toLowerCase()} ${sum || carry ? "is-active" : ""} ${highlighted ? "is-highlighted" : ""}`} transform={`translate(${x}, ${y})`}>
    <rect width="126" height="64" rx="9" />
    <text className="module-adder-block-title" x="63" y="23" textAnchor="middle">{kind}</text>
    <text className="module-adder-block-value" x="63" y="43" textAnchor="middle">S {bitValue(sum)} · C {bitValue(carry)}</text>
    {inputYs.map((inputY) => <circle className="module-adder-input-pin" key={inputY} cx="0" cy={inputY} r="3" />)}
    <circle className="module-adder-output-pin" cx="126" cy="20" r="3" /><circle className="module-adder-output-pin" cx="126" cy="48" r="3" />
    <text className="module-adder-port-label" x="112" y="17" textAnchor="end">S</text><text className="module-adder-port-label" x="112" y="55" textAnchor="end">C</text>
  </g>;
}

function CircuitFrame({ title, scale, onScaleChange, children, width = 1000, height = 360 }: { title: string; scale: number; onScaleChange: (value: number) => void; children: ReactNode; width?: number; height?: number }) {
  const id = `module-grid-${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const resetView = () => { canvasRef.current?.scrollTo({ left: 0, top: 0 }); onScaleChange(1); };
  return <div className="module-circuit">
    <div className="module-circuit-head"><span><CircuitBoard size={16} /> CIRCUIT DIAGRAM</span><div className="module-circuit-status"><small>{title}</small><ScaleControl scale={scale} onChange={onScaleChange} onReset={resetView} onExport={exportSvg} /></div></div>
    <div ref={canvasRef} className="module-circuit-canvas" onPointerDown={(event) => { if (event.button === 0) { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.panning = "true"; } }} onPointerMove={(event) => { if (event.currentTarget.dataset.panning === "true") { event.currentTarget.scrollLeft -= event.movementX; event.currentTarget.scrollTop -= event.movementY; } }} onPointerUp={(event) => { event.currentTarget.dataset.panning = "false"; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={(event) => { event.currentTarget.dataset.panning = "false"; }}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: `${width * scale}px`, height: `${height * scale}px` }} role="img" aria-label={`${title} logic gate diagram`}>
        <defs><pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(25, 48, 50, 0.07)" strokeWidth="0.7" /></pattern></defs>
        <rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />{children}
      </svg>
    </div>
  </div>;
}

function ModuleHeading({ eyebrow, title, description, meta }: { eyebrow: string; title: string; description: string; meta: string }) {
  return <header className="module-card-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{description}</p></div><div className="module-card-meta"><GitBranch size={19} /><span>{meta}</span></div></header>;
}

function FormulaStrip({ formulas }: { formulas: string[] }) {
  return <div className="formula-strip">{formulas.map((formula) => <code key={formula}>{formula}</code>)}</div>;
}

function SimulatorPanel({ inputs, outputs }: { inputs: ReactNode; outputs: ReactNode }) {
  return <div className="simulator-controls"><span className="module-label">INPUTS / LIVE SIMULATION</span><div>{inputs}</div><div className="output-row"><span className="module-label output-panel-label">OUTPUTS</span>{outputs}</div></div>;
}

function ModuleInfoBanner({ children }: { children: ReactNode }) {
  return <div className="module-info-banner"><Info size={17} /><div><span>{children}</span><details className="module-education"><summary>Open educational breakdown</summary><div className="module-education-grid"><p><strong>Circuit overview</strong><br />Follow the left-to-right signal path from source terminals through each gate or arithmetic stage to the labeled output.</p><p><strong>Signal legend</strong><br /><span className="signal-swatch swatch-a" /> primary A/X signals · <span className="signal-swatch swatch-b" /> primary B/Y signals · <span className="signal-swatch swatch-c" /> carry/borrow inputs · <span className="signal-swatch swatch-derived" /> derived signals.</p><p><strong>Logic equations</strong><br />The formula strip above is the Boolean derivation for the rendered topology. Intermediate labels expose the stage outputs used by later gates.</p><p><strong>Live worked trace</strong><br />Toggle inputs above and use playback when available to compare the highlighted stage values with the truth-table row and binary output.</p></div></details></div></div>;
}

function HalfAdderCard() {
  const [[a, setA], [b, setB]] = [useState<Bit>(1), useState<Bit>(0)];
  const [scale, setScale] = useState(1);
  const result = halfAdder(a, b);
  return <article className="module-card" id="half-adder">
    <ModuleHeading eyebrow="01 / ADDER" title="Half Adder" description="Adds two single-bit inputs with parallel XOR and AND paths." meta="2 INPUTS · 2 OUTPUTS" />
    <FormulaStrip formulas={["S = X ⊕ Y", "CO = X · Y"]} />
    <div className="module-content-grid">
      <div className="module-data-column"><div className="module-section-label">TRUTH TABLE</div><TruthTable headers={["X", "Y", "S", "CO"]} rows={halfAdderTruthTable} activeInputs={[a, b]} /><SimulatorPanel inputs={<><BitToggle label="X" value={a} onChange={setA} /><BitToggle label="Y" value={b} onChange={setB} /></>} outputs={<><Lamp label="S" value={result.sum} /><Lamp label="CO" value={result.carry} /></>} /></div>
      <CircuitFrame title="XOR + AND" scale={scale} onScaleChange={setScale}>
        <text className="module-stage-label" x="390" y="28">SUM PATH</text><text className="module-stage-label" x="390" y="198">CARRY PATH</text>
        <Terminal x={20} y={70} label="X" value={a} source="a" /><Terminal x={20} y={280} label="Y" value={b} source="b" />
        <Wire source="a" value={a} d="M96 70 H220 V78 H390" /><Wire source="a" value={a} d="M96 70 H180 V230 H390" />
        <Wire source="b" value={b} d="M96 280 H250 V94 H390" /><Wire source="b" value={b} d="M96 280 H200 V246 H390" />
        <circle className="module-junction junction-a" cx="180" cy="70" r="4" /><circle className="module-junction junction-b" cx="200" cy="280" r="4" />
        <Gate x={390} y={58} label="XOR" active={result.sum} /><Gate x={390} y={210} label="AND" active={result.carry} />
        <Wire value={result.sum} d="M488 86 H820" /><Wire value={result.carry} d="M488 238 H820" />
        <Terminal x={820} y={86} label="S / SUM" value={result.sum} kind="output" /><Terminal x={820} y={238} label="CO / CARRY" value={result.carry} kind="output" />
      </CircuitFrame>
    </div>
    <ModuleInfoBanner>The XOR gate reports the sum bit when the inputs differ, while the AND gate reports a carry only when both inputs are HIGH.</ModuleInfoBanner>
  </article>;
}

function FullAdderCard() {
  const [[a, setA], [b, setB], [cin, setCin]] = [useState<Bit>(1), useState<Bit>(0), useState<Bit>(1)];
  const [scale, setScale] = useState(1);
  const first = halfAdder(a, b);
  const second = halfAdder(first.sum, cin);
  const result = fullAdder(a, b, cin);
  return <article className="module-card" id="full-adder">
    <ModuleHeading eyebrow="02 / ADDER" title="Full Adder" description="Adds X, Y, and carry-in through two half-adder stages and an OR carry merge." meta="3 INPUTS · 2 OUTPUTS" />
    <FormulaStrip formulas={["S = X ⊕ Y ⊕ CIN", "COUT = XY + CIN(X ⊕ Y)"]} />
    <div className="module-content-grid">
      <div className="module-data-column"><div className="module-section-label">TRUTH TABLE</div><TruthTable headers={["X", "Y", "CIN", "S", "COUT"]} rows={fullAdderTruthTable} activeInputs={[a, b, cin]} /><SimulatorPanel inputs={<><BitToggle label="X" value={a} onChange={setA} /><BitToggle label="Y" value={b} onChange={setB} /><BitToggle label="CIN" value={cin} onChange={setCin} /></>} outputs={<><Lamp label="S" value={result.sum} /><Lamp label="COUT" value={result.carry} /></>} /></div>
      <CircuitFrame title="TWO HALF ADDERS + OR" scale={scale} onScaleChange={setScale}>
        <text className="module-stage-label" x="370" y="28">HALF ADDER 1</text><text className="module-stage-label" x="580" y="28">HALF ADDER 2</text><text className="module-stage-label" x="680" y="166">CARRY MERGE</text>
        <Terminal x={20} y={50} label="X" value={a} source="a" /><Terminal x={20} y={130} label="Y" value={b} source="b" /><Terminal x={20} y={300} label="CIN" value={cin} source="c" />
        <Wire source="a" value={a} d="M96 50 H180 V78 H380" /><Wire source="a" value={a} d="M96 50 H140 V220 H380" />
        <Wire source="b" value={b} d="M96 130 H220 V94 H380" /><Wire source="b" value={b} d="M96 130 H160 V236 H380" />
        <circle className="module-junction junction-a" cx="140" cy="50" r="4" /><circle className="module-junction junction-b" cx="160" cy="130" r="4" />
        <Gate x={380} y={58} label="XOR" active={first.sum} /><Gate x={380} y={200} label="AND" active={first.carry} />
        <Wire source="derived" value={first.sum} d="M478 86 H530 V78 H590" /><Wire source="derived" value={first.sum} d="M478 86 H520 V220 H590" /><circle className="module-junction junction-derived" cx="520" cy="86" r="4" />
        <Wire source="derived" value={first.carry} d="M478 228 H620 V190 H680" />
        <Wire source="c" value={cin} d="M96 300 H550 V94 H590" /><Wire source="c" value={cin} d="M96 300 H540 V236 H590" /><circle className="module-junction junction-c" cx="540" cy="300" r="4" />
        <Gate x={590} y={58} label="XOR" active={second.sum} /><Gate x={590} y={200} label="AND" active={second.carry} /><Gate x={680} y={170} label="OR" active={result.carry} />
        <Wire value={second.sum} d="M688 86 H900" /><Wire value={second.carry} d="M688 228 H640 V206 H680" />
        <Wire value={result.carry} d="M778 198 H900" /><Terminal x={900} y={86} label="S / SUM" value={result.sum} kind="output" /><Terminal x={900} y={198} label="COUT / CARRY" value={result.carry} kind="output" />
      </CircuitFrame>
    </div>
    <ModuleInfoBanner>Two half adders calculate the intermediate and final sums; the OR gate combines their carry signals into COUT.</ModuleInfoBanner>
  </article>;
}

function HalfSubtractorCard() {
  const [[a, setA], [b, setB]] = [useState<Bit>(1), useState<Bit>(1)];
  const [scale, setScale] = useState(1);
  const result = halfSubtractor(a, b);
  const notA = (a ? 0 : 1) as Bit;
  return <article className="module-card" id="half-subtractor">
    <ModuleHeading eyebrow="03 / SUBTRACTOR" title="Half Subtractor" description="Subtracts Y from X with an XOR difference path and X̅Y borrow detection." meta="2 INPUTS · 2 OUTPUTS" />
    <FormulaStrip formulas={["D = X ⊕ Y", "Borrow = X̅ · Y"]} />
    <div className="module-content-grid">
      <div className="module-data-column"><div className="module-section-label">TRUTH TABLE</div><TruthTable headers={["X", "Y", "D", "Borrow"]} rows={halfSubtractorTruthTable} activeInputs={[a, b]} /><SimulatorPanel inputs={<><BitToggle label="X" value={a} onChange={setA} /><BitToggle label="Y" value={b} onChange={setB} /></>} outputs={<><Lamp label="D" value={result.difference} /><Lamp label="Borrow" value={result.borrow} /></>} /></div>
      <CircuitFrame title="XOR + NOT + AND" scale={scale} onScaleChange={setScale}>
        <text className="module-stage-label" x="390" y="58">DIFFERENCE PATH</text><text className="module-stage-label" x="390" y="216">BORROW PATH</text>
        <Terminal x={20} y={55} label="X" value={a} source="a" /><Terminal x={20} y={285} label="Y" value={b} source="b" />
        <Wire source="a" value={a} d="M96 55 H230 V110 H380" /><Wire source="a" value={a} d="M96 55 H160 V258 H380" />
        <Wire source="b" value={b} d="M96 285 H260 V126 H380" /><Wire source="b" value={b} d="M96 285 H520 V256 H600" />
        <circle className="module-junction junction-a" cx="160" cy="55" r="4" /><circle className="module-junction junction-b" cx="520" cy="285" r="4" />
        <Gate x={380} y={90} label="XOR" active={result.difference} /><Gate x={380} y={230} label="NOT" inputs={1} active={notA} /><Gate x={600} y={220} label="AND" active={result.borrow} />
        <Wire source="derived" value={notA} d="M460 258 H540 V240 H600" />
        <Wire value={result.difference} d="M478 118 H900" /><Wire value={result.borrow} d="M698 248 H900" />
        <Terminal x={900} y={118} label="D / DIFFERENCE" value={result.difference} kind="output" /><Terminal x={900} y={248} label="Borrow" value={result.borrow} kind="output" />
      </CircuitFrame>
    </div>
    <ModuleInfoBanner>The XOR gate forms the difference. Only X is inverted, and that NOT output feeds the borrow AND gate with Y.</ModuleInfoBanner>
  </article>;
}

function FullSubtractorCard() {
  const [[a, setA], [b, setB], [bin, setBin]] = [useState<Bit>(1), useState<Bit>(0), useState<Bit>(1)];
  const [scale, setScale] = useState(1);
  const first = halfSubtractor(a, b);
  const result = fullSubtractor(a, b, bin);
  const notA = (a ? 0 : 1) as Bit;
  const borrowXY = (notA & b) as Bit;
  const borrowXBin = (notA & bin) as Bit;
  const borrowYBin = (b & bin) as Bit;
  return <article className="module-card" id="full-subtractor">
    <ModuleHeading eyebrow="04 / SUBTRACTOR" title="Full Subtractor" description="Subtracts Y and borrow-in from X with a two-XOR difference path and a three-term borrow merge." meta="3 INPUTS · 2 OUTPUTS" />
    <FormulaStrip formulas={["D = X ⊕ Y ⊕ BIN", "BOUT = X̅Y + X̅BIN + YBIN"]} />
    <div className="module-content-grid">
      <div className="module-data-column"><div className="module-section-label">TRUTH TABLE</div><TruthTable headers={["X", "Y", "BIN", "D", "BOUT"]} rows={fullSubtractorTruthTable} activeInputs={[a, b, bin]} /><SimulatorPanel inputs={<><BitToggle label="X" value={a} onChange={setA} /><BitToggle label="Y" value={b} onChange={setB} /><BitToggle label="BIN" value={bin} onChange={setBin} /></>} outputs={<><Lamp label="D" value={result.difference} /><Lamp label="BOUT" value={result.borrow} /></>} /></div>
      <CircuitFrame title="TWO-XOR DIFFERENCE + THREE-TERM BORROW" scale={scale} onScaleChange={setScale}>
        <text className="module-stage-label" x="240" y="22">DIFFERENCE CASCADE</text><text className="module-stage-label" x="520" y="22">BORROW GENERATION</text><text className="module-stage-label" x="760" y="126">BORROW MERGE</text>
        <Terminal x={20} y={50} label="X" value={a} source="a" /><Terminal x={20} y={120} label="Y" value={b} source="b" /><Terminal x={20} y={310} label="BIN" value={bin} source="c" />
        <Wire source="a" value={a} d="M96 50 H150 V50 H240" /><Wire source="a" value={a} d="M150 50 V178 H240" />
        <Wire source="b" value={b} d="M96 120 H190 V66 H240" /><Wire source="b" value={b} d="M96 120 H200 V138 H400 V178 H420" /><Wire source="b" value={b} d="M96 120 H250 V276 H580" />
        <Wire source="c" value={bin} d="M96 310 H450 V66 H520" /><Wire source="c" value={bin} d="M96 310 H560 V228 H580" /><Wire source="c" value={bin} d="M96 310 H560 V292 H580" />
        <circle className="module-junction junction-a" cx="150" cy="50" r="4" /><circle className="module-junction junction-b" cx="200" cy="120" r="4" /><circle className="module-junction junction-c" cx="560" cy="310" r="4" />
        <Gate x={240} y={30} label="XOR" active={first.difference} /><Gate x={240} y={150} label="NOT" inputs={1} active={notA} />
        <Wire source="derived" value={first.difference} d="M338 58 H430 V50 H520" />
        <Wire source="derived" value={notA} d="M320 178 H360 V162 H420" /><Wire source="derived" value={notA} d="M320 178 H380 V212 H580" /><circle className="module-junction junction-derived" cx="360" cy="178" r="4" />
        <Gate x={420} y={142} label="AND" active={borrowXY} /><Gate x={580} y={192} label="AND" active={borrowXBin} /><Gate x={580} y={256} label="AND" active={borrowYBin} />
        <Gate x={520} y={30} label="XOR" active={result.difference} />
        <Wire source="derived" value={borrowXY} d="M518 170 H700 V184 H760" /><Wire source="derived" value={borrowXBin} d="M678 220 H720 V198 H760" /><Wire source="derived" value={borrowYBin} d="M678 284 H740 V212 H760" />
        <Gate x={760} y={170} label="OR" inputs={3} active={result.borrow} />
        <Wire value={result.difference} d="M618 58 H900" /><Wire value={result.borrow} d="M858 198 H900" />
        <Terminal x={900} y={58} label="D / DIFFERENCE" value={result.difference} kind="output" /><Terminal x={900} y={198} label="BOUT / BORROW" value={result.borrow} kind="output" />
        <text className="module-stage-label" x="650" y="158">X̅Y = {bitValue(borrowXY)}</text><text className="module-stage-label" x="650" y="234">X̅BIN = {bitValue(borrowXBin)}</text><text className="module-stage-label" x="650" y="302">YBIN = {bitValue(borrowYBin)}</text>
      </CircuitFrame>
    </div>
    <ModuleInfoBanner>Only X is complemented. The three borrow terms X̅Y, X̅BIN, and YBIN feed the three-input OR gate, while the difference uses the two-XOR cascade.</ModuleInfoBanner>
  </article>;
}

function MultiplierCard() {
  const [[a1, setA1], [a0, setA0], [b1, setB1], [b0, setB0]] = [useState<Bit>(1), useState<Bit>(0), useState<Bit>(1), useState<Bit>(1)];
  const [scale, setScale] = useState(1);
  const result = multiplyTwoBitNumbers(a1, a0, b1, b0);
  const [p0, p1, p2, p3] = result.partialProducts;
  return <article className="module-card multiplier-card" id="multiplier-2bit">
    <ModuleHeading eyebrow="05 / MULTIPLIER" title="2-bit × 2-bit Multiplier" description="Generates four diagonal partial products, then combines them with a two-stage half-adder cascade." meta="4 INPUTS · 4 OUTPUTS" />
    <FormulaStrip formulas={["P₀ = A₀B₀", "P = A × B = P₃P₂P₁P₀"]} />
    <div className="module-content-grid">
      <div className="module-data-column"><div className="module-section-label">TRUTH TABLE</div><TruthTable headers={["A₁", "A₀", "B₁", "B₀", "P₃", "P₂", "P₁", "P₀"]} rows={multiplierTruthTable} activeInputs={[a1, a0, b1, b0]} /><SimulatorPanel inputs={<><BitToggle label="A₁" value={a1} onChange={setA1} /><BitToggle label="A₀" value={a0} onChange={setA0} /><BitToggle label="B₁" value={b1} onChange={setB1} /><BitToggle label="B₀" value={b0} onChange={setB0} /></>} outputs={<><Lamp label="P₃" value={result.product[0]} /><Lamp label="P₂" value={result.product[1]} /><Lamp label="P₁" value={result.product[2]} /><Lamp label="P₀" value={result.product[3]} /><code className="product-readout">{bitString(result.product)}₂ = {decimalFromBits(result.product)}₁₀</code></>} /></div>
      <CircuitFrame title="PARTIAL PRODUCTS + DIAGONAL ADDERS" scale={scale} onScaleChange={setScale}>
        <text className="module-stage-label" x="210" y="22">PARTIAL PRODUCTS &amp; GENERATION</text><text className="module-stage-label" x="420" y="22">SUMMATION STAGES</text>
        <Terminal x={20} y={42} label="A₀" value={a0} source="a0" /><Terminal x={20} y={90} label="A₁" value={a1} source="a1" /><Terminal x={20} y={230} label="B₀" value={b0} source="b0" /><Terminal x={20} y={278} label="B₁" value={b1} source="b1" />
        <Wire source="a0" value={a0} d="M96 42 H130 V32 H220" /><Wire source="a0" value={a0} d="M130 42 V172 H220" /><Wire source="a1" value={a1} d="M96 90 H160 V102 H220" /><Wire source="a1" value={a1} d="M160 90 V242 H220" /><Wire source="b0" value={b0} d="M96 230 H180 V48 H220" /><Wire source="b0" value={b0} d="M180 230 V118 H220" /><Wire source="b1" value={b1} d="M96 278 H200 V188 H220" /><Wire source="b1" value={b1} d="M200 278 V258 H220" />
        <circle className="module-junction junction-a0" cx="130" cy="42" r="4" /><circle className="module-junction junction-a1" cx="160" cy="90" r="4" /><circle className="module-junction junction-b0" cx="180" cy="230" r="4" /><circle className="module-junction junction-b1" cx="200" cy="278" r="4" />
        <Gate x={220} y={12} label="AND" active={p0} /><Gate x={220} y={82} label="AND" active={p1} /><Gate x={220} y={152} label="AND" active={p2} /><Gate x={220} y={222} label="AND" active={p3} />
        <Wire value={p0} d="M318 40 H890" />
        <Wire source="derived" value={p1} d="M318 110 H380 V112 H450" /><Wire source="derived" value={p2} d="M318 180 H400 V128 H450" />
        <Wire source="derived" value={p1} d="M318 110 H360 V202 H450" /><Wire source="derived" value={p2} d="M318 180 H380 V218 H450" />
        <Gate x={450} y={92} label="XOR" active={result.sums[0]} /><Gate x={450} y={182} label="AND" active={result.carries[0]} />
        <Wire source="derived" value={result.sums[0]} d="M548 120 H620 V112 H660" /><Wire source="derived" value={result.carries[0]} d="M548 210 H620 V218 H660" /><Wire source="derived" value={p3} d="M318 250 H600 V128 H660" /><Wire source="derived" value={p3} d="M318 250 H620 V234 H660" />
        <Gate x={660} y={92} label="XOR" active={result.sums[1]} /><Gate x={660} y={198} label="AND" active={result.carries[1]} />
        <Wire value={result.sums[0]} source="derived" d="M548 120 H600 V80 H840 V120 H890" /><Wire value={result.sums[1]} source="derived" d="M758 120 H820 V170 H890" /><Wire value={result.carries[1]} source="derived" d="M758 226 H820 V250 H890" />
        <Terminal x={890} y={40} label="P₀" value={result.product[3]} kind="output" /><Terminal x={890} y={120} label="P₁" value={result.product[2]} kind="output" /><Terminal x={890} y={170} label="P₂" value={result.product[1]} kind="output" /><Terminal x={890} y={250} label="P₃" value={result.product[0]} kind="output" />
      </CircuitFrame>
    </div>
    <ModuleInfoBanner>The four AND gates form a staircase of partial products. Two half-adder stages cascade diagonally to produce P₁, P₂, and P₃.</ModuleInfoBanner>
  </article>;
}

function ThreeBitMultiplierCard() {
  const [[a2, setA2], [a1, setA1], [a0, setA0], [b2, setB2], [b1, setB1], [b0, setB0]] = [useState<Bit>(1), useState<Bit>(0), useState<Bit>(1), useState<Bit>(1), useState<Bit>(1), useState<Bit>(1)];
  const [scale, setScale] = useState(0.75);
  const result = multiplyThreeBitNumbers(a2, a1, a0, b2, b1, b0);
  const [p00, p10, p20, p01, p11, p21, p02, p12, p22] = result.partialProducts;
  const [p6, p5, p4, p3, p2, p1, p0] = result.product;
  const [sum1, sum2, sum3, sum4, sum5, sum6, sum7, sum8] = result.adderSums;
  const [carry1, carry2, carry3, carry4, carry5, carry6, carry7, carry8] = result.adderCarries;
  return <article className="module-card multiplier-card" id="multiplier-3bit">
    <ModuleHeading eyebrow="06 / MULTIPLIER" title="3-bit × 3-bit Multiplier" description="Generates nine staircase partial products and combines them through a diagonal ripple array." meta="6 INPUTS · 7 OUTPUTS" />
    <FormulaStrip formulas={["Pᵢⱼ = AᵢBⱼ", "P = A × B = P₆P₅P₄P₃P₂P₁P₀"]} />
    <div className="module-content-grid">
      <div className="module-data-column"><div className="module-section-label">TRUTH TABLE</div><TruthTable headers={["A₂", "A₁", "A₀", "B₂", "B₁", "B₀", "P₆", "P₅", "P₄", "P₃", "P₂", "P₁", "P₀"]} rows={threeBitMultiplierTruthTable} activeInputs={[a2, a1, a0, b2, b1, b0]} /><SimulatorPanel inputs={<><BitToggle label="A₂" value={a2} onChange={setA2} /><BitToggle label="A₁" value={a1} onChange={setA1} /><BitToggle label="A₀" value={a0} onChange={setA0} /><BitToggle label="B₂" value={b2} onChange={setB2} /><BitToggle label="B₁" value={b1} onChange={setB1} /><BitToggle label="B₀" value={b0} onChange={setB0} /></>} outputs={<><Lamp label="P₆" value={p6} /><Lamp label="P₅" value={p5} /><Lamp label="P₄" value={p4} /><Lamp label="P₃" value={p3} /><Lamp label="P₂" value={p2} /><Lamp label="P₁" value={p1} /><Lamp label="P₀" value={p0} /><code className="product-readout">{bitString(result.product)}₂ = {decimalFromBits(result.product)}₁₀</code></>} /></div>
      <CircuitFrame title="DIAGONAL ARRAY + RIPPLE SUMMATION" scale={scale} onScaleChange={setScale} width={1800} height={620}>
        <text className="module-stage-label" x="220" y="18">PARTIAL PRODUCTS &amp; GENERATION</text><text className="module-stage-label" x="520" y="18">DIAGONAL SUMMATION STAGES</text><text className="module-stage-label" x="1500" y="18">PRODUCT EDGE</text>
        <Terminal x={20} y={55} label="A₀" value={a0} source="a0" /><Terminal x={20} y={95} label="A₁" value={a1} source="a1" /><Terminal x={20} y={135} label="A₂" value={a2} source="a2" /><Terminal x={20} y={465} label="B₀" value={b0} source="b0" /><Terminal x={20} y={505} label="B₁" value={b1} source="b1" /><Terminal x={20} y={545} label="B₂" value={b2} source="b2" />
        <Wire source="a0" value={a0} d="M96 55 H130 V32 H220" /><Wire source="a0" value={a0} d="M130 55 V222 H220" /><Wire source="a0" value={a0} d="M130 55 H180 V392 H220" />
        <Wire source="a1" value={a1} d="M96 95 H150 V92 H220" /><Wire source="a1" value={a1} d="M150 95 V282 H220" /><Wire source="a1" value={a1} d="M150 95 V452 H220" />
        <Wire source="a2" value={a2} d="M96 135 H170 V152 H220" /><Wire source="a2" value={a2} d="M170 135 V342 H220" /><Wire source="a2" value={a2} d="M170 135 V512 H220" />
        <Wire source="b0" value={b0} d="M96 465 H180 V48 H220" /><Wire source="b0" value={b0} d="M180 465 V108 H220" /><Wire source="b0" value={b0} d="M180 465 V168 H220" />
        <Wire source="b1" value={b1} d="M96 505 H190 V222 H220" /><Wire source="b1" value={b1} d="M190 505 V282 H220" /><Wire source="b1" value={b1} d="M190 505 V342 H220" />
        <Wire source="b2" value={b2} d="M96 545 H200 V392 H220" /><Wire source="b2" value={b2} d="M200 545 V452 H220" /><Wire source="b2" value={b2} d="M200 545 V512 H220" />
        <circle className="module-junction junction-a0" cx="130" cy="55" r="4" /><circle className="module-junction junction-a1" cx="150" cy="95" r="4" /><circle className="module-junction junction-a2" cx="170" cy="135" r="4" /><circle className="module-junction junction-b0" cx="180" cy="465" r="4" /><circle className="module-junction junction-b1" cx="190" cy="505" r="4" /><circle className="module-junction junction-b2" cx="200" cy="545" r="4" />
        <Gate x={220} y={12} label="AND" active={p00} /><Gate x={220} y={72} label="AND" active={p10} /><Gate x={220} y={132} label="AND" active={p20} /><Gate x={220} y={202} label="AND" active={p01} /><Gate x={220} y={262} label="AND" active={p11} /><Gate x={220} y={322} label="AND" active={p21} /><Gate x={220} y={372} label="AND" active={p02} /><Gate x={220} y={432} label="AND" active={p12} /><Gate x={220} y={492} label="AND" active={p22} />
        <text className="module-stage-label" x="330" y="48">P₀₀</text><text className="module-stage-label" x="330" y="108">P₁₀</text><text className="module-stage-label" x="330" y="168">P₂₀</text><text className="module-stage-label" x="330" y="238">P₀₁</text><text className="module-stage-label" x="330" y="298">P₁₁</text><text className="module-stage-label" x="330" y="358">P₂₁</text><text className="module-stage-label" x="330" y="408">P₀₂</text><text className="module-stage-label" x="330" y="468">P₁₂</text><text className="module-stage-label" x="330" y="528">P₂₂</text>
        <Wire source="derived" value={p10} d="M318 100 H450" /><Wire source="derived" value={p01} d="M318 230 H400 V124 H450" />
        <AdderBlock x={450} y={80} kind="HA" sum={sum1} carry={carry1} />
        <Wire source="derived" value={p20} d="M318 160 H360 V96 H650" /><Wire source="derived" value={p11} d="M318 290 H390 V112 H650" /><Wire source="derived" value={p02} d="M318 410 H420 V128 H650" /><AdderBlock x={650} y={80} kind="FA" sum={sum2} carry={carry2} />
        <Wire source="derived" value={sum2} d="M776 100 H850" /><Wire source="derived" value={carry1} d="M576 128 H610 V124 H850" /><AdderBlock x={850} y={80} kind="HA" sum={sum3} carry={carry3} />
        <Wire source="derived" value={p21} d="M318 340 H510 V96 H1050" /><Wire source="derived" value={p12} d="M318 470 H540 V112 H1050" /><Wire source="derived" value={carry2} d="M776 128 H820 V128 H1050" /><AdderBlock x={1050} y={80} kind="FA" sum={sum4} carry={carry4} />
        <Wire source="derived" value={sum4} d="M1176 100 H1250" /><Wire source="derived" value={carry3} d="M976 128 H1010 V124 H1250" /><AdderBlock x={1250} y={80} kind="HA" sum={sum5} carry={carry5} />
        <Wire source="derived" value={p22} d="M318 530 H620 V260 H1050" /><Wire source="derived" value={carry4} d="M1176 128 H1220 V284 H1050" /><AdderBlock x={1050} y={240} kind="HA" sum={sum6} carry={carry6} />
        <Wire source="derived" value={sum6} d="M1176 260 H1250" /><Wire source="derived" value={carry5} d="M1376 128 H1410 V284 H1250" /><AdderBlock x={1250} y={240} kind="HA" sum={sum7} carry={carry7} />
        <Wire source="derived" value={carry6} d="M1176 288 H1400 V260 H1450" /><Wire source="derived" value={carry7} d="M1376 288 H1420 V284 H1450" /><AdderBlock x={1450} y={240} kind="HA" sum={sum8} carry={carry8} />
        <Wire source="derived" value={p00} d="M318 40 H1600 V72 H1660" /><Wire source="derived" value={sum1} d="M576 100 H1620 V112 H1660" /><Wire source="derived" value={sum3} d="M976 100 H1600 V152 H1660" /><Wire source="derived" value={sum5} d="M1376 100 H1580 V192 H1660" /><Wire source="derived" value={sum7} d="M1376 260 H1560 V232 H1660" /><Wire source="derived" value={sum8} d="M1576 260 H1600 V272 H1660" /><Wire source="derived" value={carry8} d="M1576 288 H1620 V312 H1660" />
        <Terminal x={1660} y={72} label="P₀" value={p0} kind="output" /><Terminal x={1660} y={112} label="P₁" value={p1} kind="output" /><Terminal x={1660} y={152} label="P₂" value={p2} kind="output" /><Terminal x={1660} y={192} label="P₃" value={p3} kind="output" /><Terminal x={1660} y={232} label="P₄" value={p4} kind="output" /><Terminal x={1660} y={272} label="P₅" value={p5} kind="output" /><Terminal x={1660} y={312} label="P₆" value={p6} kind="output" />
        <text className="module-stage-label" x="500" y="360">P₁ = S₁</text><text className="module-stage-label" x="800" y="360">P₂ = S₃</text><text className="module-stage-label" x="1100" y="360">P₃ = S₅</text><text className="module-stage-label" x="1400" y="360">P₄ = S₇ · P₅ = S₈ · P₆ = C₈</text>
      </CircuitFrame>
    </div>
    <ModuleInfoBanner>The 3×3 array generates nine AND partial products in three shifted rows. The staggered XOR/AND stages carry each diagonal column into the next, with the final ripple edge exposing P₀ through P₆.</ModuleInfoBanner>
  </article>;
}

function PlaybackControls({ stageCount, activeStage, onStageChange }: { stageCount: number; activeStage: number; onStageChange: (stage: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => onStageChange(activeStage >= stageCount ? 0 : activeStage + 1), speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, activeStage, stageCount, onStageChange]);
  return <div className="playback-controls" aria-label="Logic propagation playback">
    <span className="module-label">PROPAGATION PLAYBACK</span>
    <button type="button" onClick={() => onStageChange(0)} aria-label="Reset propagation"><RotateCcw size={14} /></button>
    <button type="button" onClick={() => onStageChange(Math.max(0, activeStage - 1))} aria-label="Step back">‹</button>
    <button type="button" className="playback-main" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause propagation" : "Play propagation"}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
    <button type="button" onClick={() => onStageChange(Math.min(stageCount, activeStage + 1))} aria-label="Step forward">›</button>
    <input type="range" min="0" max={stageCount} value={activeStage} onChange={(event) => onStageChange(Number(event.target.value))} aria-label="Propagation stage" />
    <output>stage {activeStage}/{stageCount}</output>
    <select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="1000">Slow</option><option value="500">Normal</option><option value="200">Fast</option></select>
  </div>;
}

function PartialProductMatrix({ aBits, bBits, product }: { aBits: Bit[]; bBits: Bit[]; product: Bit[] }) {
  const width = aBits.length;
  const columns = width * 2;
  const rows = bBits.slice().reverse().map((b, rowIndex) => Array.from({ length: columns }, (_, column) => {
    const aIndex = width - 1 - (column - rowIndex);
    return column >= rowIndex && column < rowIndex + width && aIndex >= 0 && aIndex < width ? (aBits[aIndex] & b) as Bit : 0 as Bit;
  }));
  return <section className="partial-product-matrix" aria-label={`${width}-bit shift and add matrix`}>
    <div className="matrix-heading"><div><span className="module-section-label">SHIFT-AND-ADD MATRIX</span><strong>Partial-product columns</strong></div><code>{bitString(product)}₂</code></div>
    <div className="matrix-scroll"><table><thead><tr><th>row</th>{Array.from({ length: columns }, (_, index) => <th key={index}>2<sup>{columns - index - 1}</sup></th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}><th>B{bBits.length - index - 1}</th>{row.map((value, column) => <td className={value ? "is-active" : ""} key={column}>{value}</td>)}</tr>)}<tr className="matrix-total"><th>Σ</th>{product.slice().map((value, index) => <td className={value ? "is-active" : ""} key={index}>{value}</td>)}</tr></tbody></table></div>
  </section>;
}

function RippleChainDiagram({ title, aBits, bBits, result, activeStage, scale, onScaleChange, cin, subtract = false, outputLabel = "COUT" }: { title: string; aBits: Bit[]; bBits: Bit[]; result: { sum: Bit[]; carryOut: Bit; carries: Bit[]; stages: Array<{ sum: Bit; carry: Bit }> }; activeStage: number; scale: number; onScaleChange: (value: number) => void; cin: Bit; subtract?: boolean; outputLabel?: string }) {
  const width = aBits.length;
  const canvasWidth = 300 + width * 150;
  const outputY = 300;
  const canvasHeight = 340;
  return <CircuitFrame title={title} scale={scale} onScaleChange={onScaleChange} width={canvasWidth} height={canvasHeight}>
    <text className="module-stage-label" x="24" y="24">{subtract ? "A + ~B + 1" : "LSB → MSB CARRY PROPAGATION"}</text>
    <text className="module-stage-label" x="120" y="65">FULL-ADDER STAGES</text>
    {Array.from({ length: width }, (_, index) => {
      const stageIndex = width - index - 1;
      const x = 120 + index * 150;
      const y = 92;
      const stage = result.stages[stageIndex];
      const carryIn = index === 0 ? cin : result.carries[stageIndex + 1];
      const active = activeStage >= index + 1;
      const sourceB = subtract ? "derived" : "b";
      return <g key={stageIndex}>
        <text className="module-stage-label" x={x + 63} y="84" textAnchor="middle">BIT {stageIndex}</text>
        <text className="module-stage-label module-input-label" x={x - 8} y="35" textAnchor="end">A{stageIndex} = {bitValue(aBits[stageIndex])}</text>
        <Wire source="a" value={aBits[stageIndex]} d={`M${x} 42 V${y + 16}`} />
        <text className="module-stage-label module-input-label" x={x - 8} y="56" textAnchor="end">{subtract ? "~B" : "B"}{stageIndex} = {bitValue(bBits[stageIndex])}</text>
        <Wire source={sourceB} value={bBits[stageIndex]} d={`M${x - 22} 60 V${y + 32} H${x}`} />
        {index === 0 ? <><Terminal x={20} y={260} label={subtract ? "CIN = 1" : "CIN"} value={cin} source="c" /><Wire source="c" value={cin} d={`M96 260 H104 V${y + 48} H${x}`} /></> : <Wire source="derived" value={carryIn} d={`M${x - 24} ${y + 48} H${x}`} />}
        <AdderBlock x={x} y={y} kind="FA" sum={stage.sum} carry={stage.carry} highlighted={active} />
        <Wire source="derived" value={stage.sum} d={`M${x + 126} ${y + 20} H${x + 148}`} />
        <text className="module-stage-label module-output-label" x={x + 153} y={y + 24}>S{stageIndex} = {bitValue(stage.sum)}</text>
        {index < width - 1 && <Wire source="derived" value={stage.carry} d={`M${x + 126} ${y + 48} H${x + 150}`} />}
      </g>;
    })}
    <Wire source="derived" value={result.carryOut} d={`M${120 + (width - 1) * 150 + 126} 140 H${canvasWidth - 10} V${outputY}`} /><Terminal x={canvasWidth - 10} y={outputY} label={outputLabel} value={result.carryOut} kind="output" />
  </CircuitFrame>;
}

function RippleAdderCard() {
  const [width, setWidth] = useState(4);
  const [aValue, setAValue] = useState(9);
  const [bValue, setBValue] = useState(7);
  const [cin, setCin] = useState<Bit>(1);
  const [scale, setScale] = useState(0.9);
  const [activeStage, setActiveStage] = useState(0);
  const max = 2 ** width - 1;
  const aBits = bitsFromNumber(Math.min(aValue, max), width);
  const bBits = bitsFromNumber(Math.min(bValue, max), width);
  const result = rippleAdd(aBits, bBits, cin);
  const stageRows: TruthRow[] = result.stages.map((stage, index) => ({ inputs: [aBits[index], bBits[index], index === width - 1 ? cin : result.carries[index + 1]], outputs: [stage.sum, stage.carry] }));
  const canvasWidth = 260 + width * 160;
  return <article className="module-card variable-arithmetic-card" id="ripple-adder">
    <ModuleHeading eyebrow="07 / ADDER" title="Ripple-Carry Adder" description="A configurable 2–8-bit chain of full adders with carry propagation from the least-significant stage to the MSB." meta={`${width} BITS · ${width + 1} OUTPUTS`} />
    <FormulaStrip formulas={["S = A + B + CIN", "Cᵢ₊₁ = FA(Aᵢ, Bᵢ, Cᵢ)"]} />
    <div className="variable-module-controls"><label>Bit width<select value={width} onChange={(event) => { const next = Number(event.target.value); setWidth(next); setAValue((value) => Math.min(value, 2 ** next - 1)); setBValue((value) => Math.min(value, 2 ** next - 1)); setActiveStage(0); }}>{Array.from({ length: 7 }, (_, index) => <option key={index + 2} value={index + 2}>{index + 2}-bit</option>)}</select></label><label>A<input type="number" min="0" max={max} value={aValue} onChange={(event) => setAValue(Math.min(max, Math.max(0, Number(event.target.value))))} /></label><label>B<input type="number" min="0" max={max} value={bValue} onChange={(event) => setBValue(Math.min(max, Math.max(0, Number(event.target.value))))} /></label><BitToggle label="CIN" value={cin} onChange={setCin} /></div>
    <div className="module-content-grid"><div className="module-data-column"><div className="module-section-label">FULL ADDER STAGES</div><TruthTable headers={["Aᵢ", "Bᵢ", "Cᵢ", "Sᵢ", "Cᵢ₊₁"]} rows={stageRows} /><div className="ripple-result"><span>SUM</span><strong>{bitString(result.sum)}₂ = {numberFromBits(result.sum)}₁₀</strong><Lamp label="COUT" value={result.carryOut} /></div><PlaybackControls stageCount={width} activeStage={activeStage} onStageChange={setActiveStage} /></div><RippleChainDiagram title="RIPPLE FULL-ADDER CHAIN" aBits={aBits} bBits={bBits} result={result} activeStage={activeStage} scale={scale} onScaleChange={setScale} cin={cin} /></div>
    <PartialProductMatrix aBits={aBits} bBits={bBits} product={[result.carryOut, ...result.sum]} />
    <ModuleInfoBanner>Each full-adder stage receives the previous carry. The playback slider exposes the chain one depth at a time, while the matrix shows the weighted binary result.</ModuleInfoBanner>
  </article>;
}

function TwosComplementSubtractorCard() {
  const [width, setWidth] = useState(4);
  const [aValue, setAValue] = useState(7);
  const [bValue, setBValue] = useState(3);
  const [flagMode, setFlagMode] = useState<"raw" | "noBorrow">("noBorrow");
  const [scale, setScale] = useState(0.9);
  const [activeStage, setActiveStage] = useState(0);
  const max = 2 ** width - 1;
  const aBits = bitsFromNumber(Math.min(aValue, max), width);
  const bBits = bitsFromNumber(Math.min(bValue, max), width);
  const result = twosComplementSubtract(aBits, bBits);
  const signedValue = aValue - bValue;
  const outputFlag = flagMode === "raw" ? result.carryOut : result.noBorrow;
  const stageRows: TruthRow[] = result.stages.map((stage, index) => ({ inputs: [aBits[index], result.complementedB[index], index === width - 1 ? 1 : result.carries[index + 1]], outputs: [stage.sum, stage.carry] }));
  return <article className="module-card variable-arithmetic-card" id="twos-complement-subtractor">
    <ModuleHeading eyebrow="08 / SUBTRACTOR" title="Two’s Complement Subtractor" description="Subtracts B from A with bitwise inversion, a hardwired carry-in of 1, and configurable raw-carry/no-borrow reporting." meta={`${width} BITS · CARRY FLAG`} />
    <FormulaStrip formulas={["A − B = A + ~B + 1", "No Borrow = COUT"]} />
    <div className="variable-module-controls"><label>Bit width<select value={width} onChange={(event) => { const next = Number(event.target.value); setWidth(next); setAValue((value) => Math.min(value, 2 ** next - 1)); setBValue((value) => Math.min(value, 2 ** next - 1)); setActiveStage(0); }}>{Array.from({ length: 7 }, (_, index) => <option key={index + 2} value={index + 2}>{index + 2}-bit</option>)}</select></label><label>A<input type="number" min="0" max={max} value={aValue} onChange={(event) => setAValue(Math.min(max, Math.max(0, Number(event.target.value))))} /></label><label>B<input type="number" min="0" max={max} value={bValue} onChange={(event) => setBValue(Math.min(max, Math.max(0, Number(event.target.value))))} /></label><div className="segmented-control"><button type="button" className={flagMode === "raw" ? "selected" : ""} onClick={() => setFlagMode("raw")}>Raw COUT</button><button type="button" className={flagMode === "noBorrow" ? "selected" : ""} onClick={() => setFlagMode("noBorrow")}>No Borrow</button></div></div>
    <div className="module-content-grid"><div className="module-data-column"><div className="module-section-label">ADDER-BASED SUBTRACTION</div><TruthTable headers={["Aᵢ", "~Bᵢ", "Cᵢ", "Dᵢ", "Cᵢ₊₁"]} rows={stageRows} /><div className="ripple-result"><span>DIFFERENCE</span><strong>{bitString(result.difference)}₂ = {signedValue < 0 ? `${bitString(result.difference)}₂ (two's complement)` : `${signedValue}₁₀`}</strong><Lamp label={flagMode === "raw" ? "COUT" : "NO BORROW"} value={outputFlag} /></div><PlaybackControls stageCount={width} activeStage={activeStage} onStageChange={setActiveStage} /></div><RippleChainDiagram title="INVERT B + RIPPLE ADDER" aBits={aBits} bBits={result.complementedB} result={{ sum: result.difference, carryOut: result.carryOut, carries: result.carries, stages: result.stages }} activeStage={activeStage} scale={scale} onScaleChange={setScale} cin={1} subtract outputLabel={flagMode === "raw" ? "COUT" : "NO BORROW"} /></div>
    <ModuleInfoBanner>{aValue >= bValue ? `A ≥ B, so the final carry is 1 and the subtraction is non-negative (${signedValue}).` : `A < B, so the final carry is 0 and the difference is represented in ${width}-bit two's-complement form.`} The toggle lets you inspect the raw hardware carry or the semantic no-borrow flag.</ModuleInfoBanner>
  </article>;
}

export default function AdvancedModules() {
  const [filter, setFilter] = useState<"all" | "adders" | "subtractors" | "multiplier">("all");
  return <div className="modules-page"><main className="modules-main">
    <div className="modules-hero"><div className="eyebrow"><Plus size={14} /> CIRCUIT MODULES / INTERACTIVE LAB</div><h1>Arithmetic circuits,<br /><i>explained by signals.</i></h1><p>Toggle live operands, read stage-level truth tables, play signal propagation, inspect shift-and-add matrices, and export any gate canvas as SVG.</p></div>
    <nav className="module-filter-bar" aria-label="Filter arithmetic modules">{([['all', 'All'], ['adders', 'Adders'], ['subtractors', 'Subtractors'], ['multiplier', 'Multiplier']] as const).map(([value, label]) => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</nav>
    {filter === "all" || filter === "adders" ? <section id="adders" className="module-section"><div className="module-section-heading"><div><div className="eyebrow">01 / ADDERS</div><h2>Build the sum.</h2></div><span>SUM · CARRY · CARRY-IN</span></div><HalfAdderCard /><FullAdderCard /><RippleAdderCard /></section> : null}
    {filter === "all" || filter === "subtractors" ? <section id="subtractors" className="module-section"><div className="module-section-heading"><div><div className="eyebrow">02 / SUBTRACTORS</div><h2>Trace the difference.</h2></div><span>DIFFERENCE · BORROW</span></div><HalfSubtractorCard /><FullSubtractorCard /><TwosComplementSubtractorCard /></section> : null}
    {filter === "all" || filter === "multiplier" ? <section id="multiplier" className="module-section"><div className="module-section-heading"><div><div className="eyebrow">03 / MULTIPLIER</div><h2>Multiply with partial products.</h2></div><span>DIAGONAL ARRAY · ADDERS · PRODUCT</span></div><MultiplierCard /><ThreeBitMultiplierCard /></section> : null}
    <div className="modules-callout"><Calculator size={19} /><span>Every module is deterministic and live. Toggle any input or adjust the circuit scale to inspect the same logic at a comfortable size.</span><RefreshCw size={17} /></div>
  </main></div>;
}
