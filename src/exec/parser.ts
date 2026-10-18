// ============================================================
// JACK-AGENT — json_exec Block Parser
// Extracts shell command from AI response in exec mode
// ============================================================

/**
 * Regex pattern that matches the special json_exec fence block:
 *
 * ```json_exec
 * { "command": "..." }
 * ```
 */
const JSON_EXEC_PATTERN = /```json(?:_exec)?\s*\n([\s\S]*?)(?:\n?\s*```|$)/i;

/**
 * Extract the shell command from a json_exec block in the AI response.
 * Returns the command string, or null if no valid block is found.
 */
export function extractCommand(responseText: string): string | null {
  const match = JSON_EXEC_PATTERN.exec(responseText);
  if (!match) return null;

  const jsonStr = match[1].trim();
  try {
    const parsed = JSON.parse(jsonStr);
    const command = parsed.command;
    if (typeof command === 'string' && command.trim()) {
      return command.trim();
    }
  } catch {
    // Malformed JSON — try to extract command manually (even if cut off)
    const cmdMatch = /"command"\s*:\s*"([^"]+)(?:"|$)/.exec(jsonStr);
    if (cmdMatch) {
      return cmdMatch[1].trim();
    }
  }

  return null;
}

/** Remove json_exec blocks from response text for clean display */
export function stripExecBlocks(responseText: string): string {
  return responseText.replace(JSON_EXEC_PATTERN, '').trim();
}
