/**
 * Phase 1.3 of the mila-planogram fork — residential domain OUT.
 *
 * The upstream editor ships residential authoring tools (doors, windows, stairs).
 * Retail planograms do not model them, so they are switched off here through a
 * single source of truth instead of being deleted from the geometry/store layer.
 * Keeping the code paths intact means:
 *   - no half-removed references inside `stores/project.ts`, canvas or export code;
 *   - a future retail feature can reuse the opening geometry if it ever needs it.
 *
 * Anything that activates one of these tools must consult this module first, so a
 * disabled tool is never reachable from the toolbar, a sidebar entry or a hotkey.
 */
export const RESIDENTIAL_DOMAIN_ENABLED = false;

/** Authoring tools that belong to the residential domain. */
export const RESIDENTIAL_TOOLS = ['door', 'window'] as const;
export type ResidentialTool = (typeof RESIDENTIAL_TOOLS)[number];

/** Sidebar actions (not part of the `Tool` union) that are also residential-only. */
export const RESIDENTIAL_ACTIONS = ['stairs'] as const;
export type ResidentialAction = (typeof RESIDENTIAL_ACTIONS)[number];

export function isResidentialToolEnabled(_tool: ResidentialTool): boolean {
  return RESIDENTIAL_DOMAIN_ENABLED;
}

export function isResidentialActionEnabled(_action: ResidentialAction): boolean {
  return RESIDENTIAL_DOMAIN_ENABLED;
}

/**
 * Runtime guard for tool activation. Call sites pass the tool they were about to
 * activate and receive the tool that is actually allowed: residential tools fall
 * back to selection instead of leaving the canvas in a dead placement mode.
 */
export function guardTool<T extends string>(tool: T, isResidential: (tool: T) => boolean): T | 'select' {
  return isResidential(tool) ? 'select' : tool;
}
