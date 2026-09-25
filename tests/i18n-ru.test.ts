import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { locale, t, translate, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/locales/en';
import { ru } from '$lib/i18n/locales/ru';
import { catalogCategoryLabels } from '$lib/i18n/catalogCategories';
import { MILA_EQUIPMENT_CATEGORY } from '$lib/planogram/equipmentCatalog';

afterEach(() => { vi.unstubAllGlobals(); locale.set('en'); });

const keys = Object.keys(ru) as (keyof typeof en)[];

describe('Russian locale (Phase 1.6)', () => {
  it('only declares keys that exist in the English dictionary', () => {
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) expect(Object.hasOwn(en, key), key).toBe(true);
  });

  it('keeps placeholders and non-empty text in agreement with English', () => {
    for (const key of keys) {
      expect(ru[key]!.trim(), key).not.toBe('');
      expect(ru[key]!.match(/\{\w+\}/g) ?? [], key).toEqual(en[key].match(/\{\w+\}/g) ?? []);
    }
  });

  it('falls back to English for keys that are not translated yet', () => {
    // Deliberately untranslated upstream key.
    const untranslated = 'settings.close' as keyof typeof en;
    expect(Object.hasOwn(ru, untranslated)).toBe(false);
    expect(translate('ru', untranslated)).toBe(en[untranslated]);
    expect(translate('ru', 'saveControls.now')).toBe('Сохранено: только что');
    expect(translate('ru', 'saveControls.seconds', { count: 5 })).toBe('Сохранено: 5 с назад');
  });

  it('covers the toolbar, catalog and menu surfaces replaced by the fork', () => {
    const required: (keyof typeof en)[] = [
      'projectToolbar.back', 'projectToolbar.projects', 'projectToolbar.undo', 'projectToolbar.redo',
      'exportMenu.title', 'exportMenu.import', 'exportMenu.json', 'exportMenu.package',
      'toolbarView.view', 'toolbarView.plan', 'toolbarView.panLabel', 'toolbarView.zoomIn',
      'floorControls.floors', 'floorControls.add',
      'saveControls.save', 'saveControls.saved', 'saveControls.error',
      'buildTools.build', 'buildTools.select', 'buildTools.wall', 'buildTools.objects', 'buildTools.rooms',
      'objectControls.search', 'roomChoices.presets',
      'catalogCategories.milaEquipment', 'settings.title', 'editorPanels.layers',
      'shortcuts.title', 'shortcuts.tools', 'shortcuts.save', 'welcome.title', 'welcome.importPlanDesc',
    ];
    for (const key of required) expect(ru[key], key).toBeTruthy();
  });

  it('labels the Mila equipment category in every locale', () => {
    expect(catalogCategoryLabels[MILA_EQUIPMENT_CATEGORY]).toBe('catalogCategories.milaEquipment');
    expect(translate('en', 'catalogCategories.milaEquipment')).toBe('Mila Shelving');
    expect(translate('ru', 'catalogCategories.milaEquipment')).toBe('Стеллажи Mila');
    expect(translate('pt', 'catalogCategories.milaEquipment')).toBe('Estantes Mila');
  });

  it('selects and persists ru through the locale store', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('document', { documentElement: { lang: 'en' } });
    const values: string[] = [];
    const unsubscribe = t.subscribe((translate) => values.push(translate('projectToolbar.undo')));
    locale.set('ru');
    unsubscribe();
    expect(values).toEqual(['Undo', 'Отменить']);
    expect(setItem).toHaveBeenCalledWith('o3d_locale', 'ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(get(locale)).toBe('ru');
    locale.set('fr' as Locale);
    expect(get(locale)).toBe('ru');
  });
});
