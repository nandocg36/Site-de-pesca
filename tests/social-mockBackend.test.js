import { describe, expect, it, beforeEach } from 'vitest';
import { createMockBackend } from '../js/social/adapters/mockBackend.js';

describe('createMockBackend (sem persistência)', () => {
  let be;

  beforeEach(() => {
    be = createMockBackend({ persist: false });
  });

  it('inicia sem sessão', async () => {
    const s = await be.getSession();
    expect(s.user).toBeNull();
  });

  it('signIn cria utilizador e sessão', async () => {
    const r = await be.signIn('novo@teste.br', '1234');
    expect(r.ok).toBe(true);
    const s = await be.getSession();
    expect(s.user?.email).toBe('novo@teste.br');
  });

  it('createPost exige sessão', async () => {
    const r = await be.createPost({ caption: 'x', visibility: 'public' });
    expect(r.ok).toBe(false);
  });

  it('fluxo: login, post, inquérito, agregado', async () => {
    await be.signIn('fluxo@teste.br', '1234');
    const p = await be.createPost({ caption: 'Teste', visibility: 'public' });
    expect(p.ok).toBe(true);
    const surv = await be.submitSurvey('sardinha', true, 4, 4);
    expect(surv.ok).toBe(true);
    const agg = await be.getAggregatesToday();
    expect(agg.ok).toBe(true);
    expect(agg.top?.id).toBe('sardinha');
  });
});
