/**
 * Retention Policy Designer
 *
 * This app intentionally separates:
 * - HUMAN: business intent and policy design (Instruction text)
 * - SYSTEM: policy parsing + simulation on CSV rows
 *
 * Students edit the Instruction box. The app parses the [POLICY] block
 * to compute offers, and renders the Mermaid diagram for documentation.
 *
 * Limitations (intentional):
 * - churn_score is a heuristic (not a trained model).
 * - policy parsing supports only a simple KEY=VALUE format.
 */
const DEFAULT_INSTRUCTION = `ROLE:
You are a retention strategy agent. Your goal is to reduce churn while keeping coupon spend under control.

CONTEXT:
You receive customer records with (segment, churn_score, monthly_charges, tenure, contract).

INSTRUCTION (Pseudocode):
INPUT: customer record
OUTPUT: offer in {NO_OFFER, SMALL, MEDIUM, BIG}

1) Data Quality Gate
IF churn_score is missing OR segment is missing THEN
  RETURN NO_OFFER

2) Risk Thresholds
IF churn_score < LOW_THRESHOLD THEN
  RETURN NO_OFFER
ELSE IF churn_score < MED_THRESHOLD THEN
  IF segment == VIP THEN RETURN MED_VIP_OFFER
  ELSE RETURN NO_OFFER
ELSE
  CASE segment:
    VIP -> HIGH_VIP_OFFER
    STANDARD -> HIGH_STANDARD_OFFER
    OTHER -> HIGH_OTHER_OFFER

FORMAT:
Return only the offer code.

[POLICY]
LOW_THRESHOLD=0.40
MED_THRESHOLD=0.70
MED_VIP_OFFER=SMALL
HIGH_VIP_OFFER=BIG
HIGH_STANDARD_OFFER=MEDIUM
HIGH_OTHER_OFFER=SMALL
COST_SMALL=10
COST_MEDIUM=25
COST_BIG=50

[MERMAID]
flowchart TD
  A([Start]) --> B{Data valid?}
  B -- No --> Z([NO_OFFER])
  B -- Yes --> C{Churn < LOW?}
  C -- Yes --> Z
  C -- No --> D{Churn < MED?}
  D -- Yes --> E{VIP?}
  E -- Yes --> S([SMALL])
  E -- No --> Z
  D -- No --> F{Segment?}
  F -- VIP --> G([BIG])
  F -- STANDARD --> H([MEDIUM])
  F -- OTHER --> S
`;

const el = (id) => document.getElementById(id);

function parsePolicy(instructionText) {
  /**
   * Parse a simple KEY=VALUE policy block.
   *
   * Block format:
   * [POLICY]
   * KEY=VALUE
   * ...
   *
   * @param {string} instructionText
   * @returns {Object<string, string>}
   */
  const lines = instructionText.split("\n");
  const start = lines.findIndex((x) => x.trim() === "[POLICY]");
  if (start === -1) return {};

  const policy = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("[")) break; // next section
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (!m) continue;
    policy[m[1]] = m[2];
  }
  return policy;
}

function extractMermaid(instructionText) {
  /**
   * Extract Mermaid code from [MERMAID] section.
   *
   * @param {string} instructionText
   * @returns {string}
   */
  const lines = instructionText.split("\n");
  const start = lines.findIndex((x) => x.trim() === "[MERMAID]");
  if (start === -1) return "flowchart TD\n  A[No MERMAID section found]";
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "[POLICY]" || line.trim().startsWith("[") && line.trim() !== "[MERMAID]") break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function toNumber(policy, key, fallback) {
  const v = policy[key];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function churnScoreHeuristic(row) {
  /**
   * A simple heuristic churn score (0..1).
   * This is intentionally NOT a real ML model.
   *
   * @param {{segment:string, monthly_charges:number, tenure:number, contract:string}} row
   * @returns {number}
   */
  let s = 0.0;

  // English comment: month-to-month customers tend to churn more
  if (String(row.contract).toLowerCase().includes("month")) s += 0.35;
  if (Number(row.tenure) < 6) s += 0.25;
  if (Number(row.monthly_charges) > 100) s += 0.15;
  if (String(row.segment).toUpperCase() === "OTHER") s += 0.05;

  return Math.max(0, Math.min(1, s));
}

function decideOffer(row, policy) {
  /**
   * Apply policy thresholds and segment-based offers.
   *
   * @param {Object} row
   * @param {Object<string, string>} policy
   * @returns {string}
   */
  const low = toNumber(policy, "LOW_THRESHOLD", 0.40);
  const med = toNumber(policy, "MED_THRESHOLD", 0.70);

  const seg = String(row.segment || "").toUpperCase();
  const churn = row.churn_score;

  if (!Number.isFinite(churn) || !seg) return "NO_OFFER";

  if (churn < low) return "NO_OFFER";

  if (churn < med) {
    if (seg === "VIP") return policy.MED_VIP_OFFER || "SMALL";
    return "NO_OFFER";
  }

  if (seg === "VIP") return policy.HIGH_VIP_OFFER || "BIG";
  if (seg === "STANDARD") return policy.HIGH_STANDARD_OFFER || "MEDIUM";
  return policy.HIGH_OTHER_OFFER || "SMALL";
}

function offerCost(offer, policy) {
  /**
   * Map offer code to numeric cost.
   *
   * @param {string} offer
   * @param {Object<string, string>} policy
   * @returns {number}
   */
  const o = String(offer).toUpperCase();
  if (o === "BIG") return toNumber(policy, "COST_BIG", 50);
  if (o === "MEDIUM") return toNumber(policy, "COST_MEDIUM", 25);
  if (o === "SMALL") return toNumber(policy, "COST_SMALL", 10);
  return 0;
}

function parseCSV(text) {
  /**
   * Minimal CSV parser for this lab (no quoted commas support).
   * Keep it simple to focus on business logic.
   *
   * @param {string} text
   * @returns {Array<Object>}
   */
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((x) => x.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((x) => x.trim());
    const row = {};
    headers.forEach((h, idx) => (row[h] = parts[idx]));
    rows.push(row);
  }
  return rows;
}

async function loadData() {
  const res = await fetch("./data/telco_sample.csv");
  if (!res.ok) throw new Error("Failed to load CSV");
  const text = await res.text();
  return parseCSV(text);
}

async function renderMermaid(mermaidCode) {
  /**
   * Render Mermaid code into the diagram container.
   *
   * Mermaid initialization is based on Mermaid docs using mermaid.initialize(). [web:430]
   */
  const mermaid = window.__mermaid__;
  const container = el("diagram");
  container.innerHTML = `<pre class="mermaid">${escapeHtml(mermaidCode)}</pre>`;
  await mermaid.run({ querySelector: ".mermaid" });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderTable(rows) {
  const table = el("outTable");
  const headers = ["customer_id", "segment", "monthly_charges", "tenure", "contract", "churn_score", "offer", "cost"];

  table.innerHTML = "";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.slice(0, 12).forEach((r) => {
    const tr = document.createElement("tr");
    headers.forEach((h) => {
      const td = document.createElement("td");
      td.textContent = r[h];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

function fmtMoney(x) {
  return `$${Number(x).toFixed(0)}`;
}

function main() {
  el("instruction").value = DEFAULT_INSTRUCTION;

  el("runBtn").addEventListener("click", async () => {
    el("status").textContent = "Running...";
    try {
      const instructionText = el("instruction").value;
      const policy = parsePolicy(instructionText);
      const mermaidCode = extractMermaid(instructionText);

      const raw = await loadData();
      const enriched = raw.map((r) => {
        const row = {
          customer_id: r.customer_id,
          segment: r.segment,
          monthly_charges: Number(r.monthly_charges),
          tenure: Number(r.tenure),
          contract: r.contract
        };
        const churn_score = churnScoreHeuristic(row);
        const offer = decideOffer({ ...row, churn_score }, policy);
        const cost = offerCost(offer, policy);
        return { ...row, churn_score: churn_score.toFixed(2), offer, cost };
      });

      // KPIs
      const totalCost = enriched.reduce((a, r) => a + Number(r.cost), 0);
      const highRisk = enriched.filter((r) => Number(r.churn_score) >= toNumber(policy, "MED_THRESHOLD", 0.7));
      const highRiskCovered = highRisk.filter((r) => r.offer !== "NO_OFFER").length;
      const coverage = highRisk.length ? (highRiskCovered / highRisk.length) : 0;

      el("kpiRows").textContent = String(enriched.length);
      el("kpiBudget").textContent = fmtMoney(totalCost);
      el("kpiCoverage").textContent = `${Math.round(coverage * 100)}%`;

      // Offer counts
      const counts = {};
      enriched.forEach((r) => (counts[r.offer] = (counts[r.offer] || 0) + 1));
      el("offerCounts").textContent = JSON.stringify(counts, null, 2);

      renderTable(enriched);
      await renderMermaid(mermaidCode);

      el("status").textContent = "Done.";
    } catch (err) {
      el("status").textContent = `Error: ${err.message}`;
    }
  });
}

main();
