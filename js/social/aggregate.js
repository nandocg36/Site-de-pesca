/**
 * Agrega respostas de isca para cartões tipo “melhor isca do dia”.
 * @param {{ baitId: string }[]} surveyRows
 * @param {{ id: string, label: string }[]} baitCatalog — ex. BAIT_OPTIONS
 * @param {number} [minVotes=1]
 * @returns {{ counts: Record<string, number>, top: { id: string, label: string, count: number } | null, total: number }}
 */
export function aggregateBaitVotes(surveyRows, baitCatalog, minVotes = 1) {
  const labelById = Object.fromEntries(baitCatalog.map((b) => [b.id, b.label]));
  const counts = {};
  let total = 0;
  for (const row of surveyRows) {
    const id = row?.baitId;
    if (typeof id !== 'string' || !id) continue;
    counts[id] = (counts[id] || 0) + 1;
    total += 1;
  }
  let top = null;
  for (const [id, count] of Object.entries(counts)) {
    if (count < minVotes) continue;
    if (!top || count > top.count) {
      top = { id, label: labelById[id] || id, count };
    }
  }
  return { counts, top, total };
}
