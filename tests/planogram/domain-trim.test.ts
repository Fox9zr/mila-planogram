import { describe, expect, it } from 'vitest';
import { RESIDENTIAL_DOMAIN_ENABLED, RESIDENTIAL_TOOLS, RESIDENTIAL_ACTIONS, guardTool, isResidentialActionEnabled, isResidentialToolEnabled } from '$lib/planogram/domainTrim';
import { handleGlobalShortcut } from '$lib/utils/shortcuts';
import { get } from 'svelte/store';
import { selectedTool, type Tool } from '$lib/stores/project';

describe('residential domain is out of scope (Phase 1.3)', () => {
  it('reports every residential tool and action as disabled', () => {
    expect(RESIDENTIAL_DOMAIN_ENABLED).toBe(false);
    expect(RESIDENTIAL_TOOLS).toEqual(['door', 'window']);
    expect(RESIDENTIAL_ACTIONS).toEqual(['stairs']);
    for (const tool of RESIDENTIAL_TOOLS) expect(isResidentialToolEnabled(tool)).toBe(false);
    for (const action of RESIDENTIAL_ACTIONS) expect(isResidentialActionEnabled(action)).toBe(false);
  });

  it('falls back to selection when a residential tool is activated', () => {
    const residential = (tool: Tool) => (RESIDENTIAL_TOOLS as readonly string[]).includes(tool);
    expect(guardTool<Tool>('door', residential)).toBe('select');
    expect(guardTool<Tool>('window', residential)).toBe('select');
    expect(guardTool<Tool>('furniture', residential)).toBe('furniture');
  });

  it('does not activate the door tool from the keyboard', () => {
    selectedTool.set('select');
    const prevented = { value: false };
    const event = { key: 'd', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null,
      preventDefault: () => { prevented.value = true; } } as unknown as KeyboardEvent;
    const handled = handleGlobalShortcut(event);
    expect(get(selectedTool)).toBe('select');
    expect(handled).toBe(false);
  });
});
