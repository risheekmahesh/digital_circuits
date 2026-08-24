import { useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { AlertCircle, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud, X } from "lucide-react";

type UploadState = "idle" | "reading" | "ready" | "error";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.txt";
const MAX_FILE_BYTES = 3_000_000;

function fileMimeType(file: File) {
  if (file.type === "application/pdf" || file.type === "image/png" || file.type === "image/jpeg") return file.type;
  if (file.name.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (file.name.toLowerCase().endsWith(".png")) return "image/png";
  if (file.name.toLowerCase().match(/\.(jpe?g)$/)) return "image/jpeg";
  return "";
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

function latexSource(value: string) {
  let source = value.trim();
  let displayMode = false;
  if ((source.startsWith("$$") && source.endsWith("$$")) || (source.startsWith("\\[") && source.endsWith("\\]"))) {
    displayMode = true;
    source = source.startsWith("$$") ? source.slice(2, -2) : source.slice(2, -2);
  } else if (source.startsWith("$") && source.endsWith("$")) {
    source = source.slice(1, -1);
  } else if (source.startsWith("\\(") && source.endsWith("\\)")) {
    source = source.slice(2, -2);
  }
  return { source, displayMode };
}

function SolutionMath({ value }: { value: string }) {
  const { source, displayMode } = latexSource(value);
  return <span className={displayMode ? "solution-math solution-math-display" : "solution-math"} dangerouslySetInnerHTML={{ __html: katex.renderToString(source, { displayMode, throwOnError: false, trust: false }) }} />;
}

function SolutionText({ value }: { value: string }) {
  const tokenPattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  const parts = value.split(tokenPattern);
  return <div className="problem-solution-text">{parts.map((part, index) => {
    if (!part) return null;
    const isMath = part.startsWith("$") || part.startsWith("\\(") || part.startsWith("\\[");
    if (isMath) return <SolutionMath key={index} value={part} />;
    return <span key={index}>{part.split("\\n").map((line, lineIndex, lines) => <span key={lineIndex}>{line}{lineIndex < lines.length - 1 && <br />}</span>)}</span>;
  })}</div>;
}

export default function ProblemStatement() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [solving, setSolving] = useState(false);
  const [solution, setSolution] = useState("");
  const [solveError, setSolveError] = useState("");

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setSolution("");
    setSolveError("");
    setUploadMessage("");
    if (!selectedFile.name.match(/\.(pdf|png|jpe?g|txt)$/i)) {
      setUploadState("error");
      setUploadMessage("Choose a PDF, PNG, JPG, JPEG, or TXT file.");
      return;
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      setUploadState("error");
      setUploadMessage("Please choose a file smaller than 3 MB.");
      return;
    }

    setUploadState("reading");
    try {
      if (selectedFile.name.toLowerCase().endsWith(".txt")) {
        setProblem(await selectedFile.text());
      } else {
        const mimeType = fileMimeType(selectedFile);
        if (!mimeType) throw new Error("This file type cannot be extracted.");
        const data = await readAsDataUrl(selectedFile);
        const response = await fetch("/api/problem-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: selectedFile.name, mimeType, data }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The uploaded problem could not be extracted.");
        if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("No readable problem text was found in the upload.");
        setProblem(payload.text.trim());
      }
      setUploadState("ready");
      setUploadMessage("Problem text loaded below. Review or edit it before solving.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(error instanceof Error ? error.message : "The selected file could not be processed.");
    }
  };

  const clearUpload = () => {
    setFile(null);
    setUploadState("idle");
    setUploadMessage("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const solveProblem = async () => {
    const statement = problem.trim();
    if (!statement) {
      setSolveError("Enter or upload a problem statement before solving.");
      return;
    }
    setSolving(true);
    setSolveError("");
    setSolution("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "Problem Statement Solver: the user has supplied a digital-circuit problem for Gemini to solve.",
          history: [],
          question: "Solve the following digital-circuit problem. Explain the reasoning clearly, state any assumptions, show relevant Boolean equations or truth-table reasoning, and finish with a concise answer.\n\nProblem statement:\n" + statement,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The AI solver could not respond right now.");
      if (typeof payload.answer !== "string" || !payload.answer.trim()) throw new Error("The solver returned an empty answer. Please try again.");
      setSolution(payload.answer.trim());
    } catch (error) {
      setSolveError(error instanceof Error ? error.message : "The AI solver could not respond right now.");
    } finally {
      setSolving(false);
    }
  };

  return <div className="problem-page">
    <header className="dashboard-page-heading problem-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> PROBLEM STATEMENT WORKSPACE</div><h1>Turn a circuit prompt into <i>clear reasoning.</i></h1><p>Write a digital-circuit problem or upload a reference file. Review the extracted statement, then generate a structured digital-logic solution.</p></div><div className="problem-page-badge"><Sparkles size={15} /> LOGIC SOLVER</div></header>

    <section className="problem-workspace-card" aria-labelledby="problem-workspace-title">
      <div className="problem-card-heading"><div><div className="eyebrow">01 / INPUT</div><h2 id="problem-workspace-title">Describe the problem</h2><p>Use either method below. Uploaded text is always placed in the editor for review before the solver sees it.</p></div><FileText size={25} /></div>
      <div className="problem-input-grid">
        <div className="problem-write-panel"><div className="problem-panel-kicker">WRITE PROBLEM</div><label htmlFor="problem-statement">Problem statement</label><textarea id="problem-statement" value={problem} onChange={(event) => { setProblem(event.target.value); setSolution(""); setSolveError(""); }} placeholder="Enter your digital circuit problem here..." spellCheck={false} /><div className="problem-editor-footer"><span>No word limit</span><span>Multiline input supported</span></div></div>
        <div className="problem-upload-panel"><div className="problem-panel-kicker">UPLOAD PROBLEM</div><input ref={inputRef} className="problem-file-input" type="file" accept={ACCEPTED_TYPES} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void processFile(selected); }} /><button type="button" className={`problem-dropzone ${dragActive ? "is-dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); const selected = event.dataTransfer.files?.[0]; if (selected) void processFile(selected); }}><span className="problem-upload-icon"><UploadCloud size={25} /></span><strong>Drop a problem file here</strong><small>or click to browse PDF, PNG, JPG, JPEG, TXT</small></button>{file && <div className={`problem-file-status ${uploadState === "error" ? "has-error" : ""}`}><FileText size={16} /><span><strong>{file.name}</strong><small>{uploadState === "reading" ? "Reading uploaded file…" : uploadMessage || "Selected upload"}</small></span><button type="button" aria-label="Remove uploaded file" onClick={clearUpload}><X size={15} /></button></div>}{uploadState === "reading" && <div className="problem-progress"><Loader2 size={14} className="is-spinning" /> Extracting problem text for review…</div>}{uploadState === "ready" && <div className="problem-success"><CheckCircle2 size={14} /> Extracted text is ready to review.</div>}{uploadState === "error" && <div className="problem-error"><AlertCircle size={14} /> {uploadMessage}</div>}</div>
      </div>
      <div className="problem-solve-row"><div><div className="problem-panel-kicker">02 / SOLVE</div><p>Check the reviewed statement above, then generate a structured digital-logic solution.</p></div><button type="button" className="problem-solve-button" onClick={() => void solveProblem()} disabled={solving || !problem.trim()}>{solving ? <><Loader2 size={17} className="is-spinning" /> Solving…</> : <><Sparkles size={17} /> Solve Problem</>}</button></div>
      {solveError && <div className="problem-error problem-solve-error"><AlertCircle size={15} /> {solveError}</div>}
    </section>

    {(solution || solving) && <section className="problem-solution-card" aria-live="polite"><div className="problem-card-heading"><div><div className="eyebrow">03 / RESULT</div><h2>Solution</h2><p>The generated answer is shown here so you can compare it with your circuit work.</p></div><Sparkles size={25} /></div>{solving ? <div className="problem-solution-loading"><Loader2 size={18} className="is-spinning" /> Working through the circuit…</div> : <SolutionText value={solution} />}</section>}
  </div>;
}
