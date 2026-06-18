// scoring.js — Production Potential Assessment engine
// Mirrors §7 of the blueprint. Pure functions, no dependencies.

// Nine weighted hackathon-judging dimensions; weights sum to 100.
export const DIMENSIONS = [
  { key: 'realProblem', label: 'Solves a real problem', weight: 15 },
  { key: 'businessValue', label: 'Aligns to business value', weight: 13 },
  { key: 'aiTools', label: 'Use of AI tools', weight: 12 },
  { key: 'feasibility', label: 'Technical feasibility', weight: 12 },
  { key: 'demo', label: 'Demo quality', weight: 11 },
  { key: 'ui', label: 'UI / experience', weight: 10 },
  { key: 'repeatability', label: 'Repeatability', weight: 10 },
  { key: 'playFit', label: 'Fit for solution plays', weight: 9 },
  { key: 'compliance', label: 'Compliance / risk profile', weight: 8 }
];

// Each dimension is scored 0–3. Contribution = score/3 * weight.
export function computeScore(scores) {
  return DIMENSIONS.reduce((total, d) => {
    const s = Number(scores?.[d.key] ?? 0);
    return total + (Math.max(0, Math.min(3, s)) / 3) * d.weight;
  }, 0);
}

export function rounded(scores) {
  return Math.round(computeScore(scores));
}

// Band logic with hard gates (§7.4 / §7.5).
// - Compliance or feasibility scored 0 => capped at "Not Ready".
// The production owner is assigned later (at the pipeline step), so it is not
// part of scoring or the band.
export function computeBand(useCase) {
  const scores = useCase.scores || {};
  const total = computeScore(scores);

  // Hard gates first.
  if (Number(scores.compliance) === 0 || Number(scores.feasibility) === 0) {
    return band('Not Ready', total);
  }

  let label;
  if (total >= 70) label = 'High Potential';
  else if (total >= 45) label = 'Needs Incubation';
  else label = 'Not Ready';

  return band(label, total);
}

function band(label, total) {
  const map = {
    'High Potential': { label, key: 'high', color: '#107c10', emoji: '🟢' },
    'Needs Incubation': { label, key: 'incubation', color: '#c19c00', emoji: '🟡' },
    'Not Ready': { label, key: 'notready', color: '#8a8886', emoji: '⚪' }
  };
  return { ...map[label], score: Math.round(total) };
}

// Flag chips independent of band (§7.3).
export function computeFlags(useCase) {
  const scores = useCase.scores || {};
  const flags = [];

  if (Number(scores.repeatability) === 3) {
    flags.push({ key: 'reusable', label: 'Reusable pattern', emoji: '🔵', tone: 'info' });
  }
  if (Number(scores.compliance) <= 1) {
    flags.push({ key: 'compliance', label: 'Compliance risk', emoji: '⚠️', tone: 'warn' });
  }
  if (Number(scores.ui) === 3 && Number(scores.demo) === 3) {
    flags.push({ key: 'polished', label: 'Polished build', emoji: '✨', tone: 'good' });
  }
  if (Number(scores.aiTools) === 3) {
    flags.push({ key: 'ai-showcase', label: 'AI showcase', emoji: '🤖', tone: 'info' });
  }
  if (Number(scores.businessValue) === 3 && Number(scores.realProblem) === 3) {
    flags.push({ key: 'strategic', label: 'Strategic bet', emoji: '🎯', tone: 'good' });
  }
  return flags;
}
