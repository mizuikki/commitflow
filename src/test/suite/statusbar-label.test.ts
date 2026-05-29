import * as assert from 'assert';

suite('statusbar label', () => {
  test('returns setup when no profiles', async () => {
    const mod = await import('../../extension');
    const formatStatusBarLabel = (mod as any).formatStatusBarLabel as (state: any) => string;

    const out = formatStatusBarLabel({
      profiles: [],
      activeProfile: undefined,
      language: 'English',
      promptPreset: 'without-gitmoji'
    });

    assert.strictEqual(out, 'CommitFlow: Setup');
  });

  test('returns no provider when active profile missing', async () => {
    const mod = await import('../../extension');
    const formatStatusBarLabel = (mod as any).formatStatusBarLabel as (state: any) => string;

    const out = formatStatusBarLabel({
      profiles: [{ id: 'p1' }],
      activeProfile: undefined,
      language: 'English',
      promptPreset: 'without-gitmoji'
    });

    assert.strictEqual(out, 'CommitFlow: No Provider');
  });

  test('formats english + gitmoji prefix compactly', async () => {
    const mod = await import('../../extension');
    const formatStatusBarLabel = (mod as any).formatStatusBarLabel as (state: any) => string;

    const out = formatStatusBarLabel({
      profiles: [{ id: 'p1' }],
      activeProfile: { id: 'p1' },
      language: 'English',
      promptPreset: 'gitmoji-prefix'
    });

    assert.strictEqual(out, 'EN·G+');
  });

  test('formats simplified chinese + without gitmoji compactly', async () => {
    const mod = await import('../../extension');
    const formatStatusBarLabel = (mod as any).formatStatusBarLabel as (state: any) => string;

    const out = formatStatusBarLabel({
      profiles: [{ id: 'p1' }],
      activeProfile: { id: 'p1' },
      language: 'Simplified Chinese',
      promptPreset: 'without-gitmoji'
    });

    assert.strictEqual(out, 'ZH-CN·NoG');
  });
});

