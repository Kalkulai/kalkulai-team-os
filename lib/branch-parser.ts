// Linear identifier format: <TEAM>-<NUMBER>, e.g. "kal-42", "ENG-1234"
const LINEAR_ID_RE = /\b([a-z]{2,5}-\d{1,6})\b/i;

export function extractLinearIdFromBranch(branchName: string): string | null {
  const match = branchName.match(LINEAR_ID_RE);
  return match ? match[1].toUpperCase() : null;
}

export function extractLinearIdFromText(text: string): string | null {
  return extractLinearIdFromBranch(text);
}
