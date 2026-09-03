// @ts-nocheck
import {
  scriptAcessoSchema,
  scriptMaterialsPessoaSchema,
  cohortConfigSchema,
  normalizeMaterials,
  memberMaterialsView,
  memberMaterialsStatus,
  countSubmitted,
  countItems,
  emptyPessoa,
} from '../../utils/validation-materials.cjs';

describe('scriptAcessoSchema (acesso a plataforma de conteudo)', () => {
  it('aceita URL http(s) com login/senha/observacoes opcionais', () => {
    const r = scriptAcessoSchema.safeParse({ plataforma_url: ' https://hotmart.com/club ' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ plataforma_url: 'https://hotmart.com/club', login: '', senha: '', observacoes: '' });
  });

  it('rejeita URL sem http(s)', () => {
    expect(scriptAcessoSchema.safeParse({ plataforma_url: 'hotmart.com' }).success).toBe(false);
    expect(scriptAcessoSchema.safeParse({ plataforma_url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('nao mexe na senha (sem trim) e limita tamanho', () => {
    const r = scriptAcessoSchema.safeParse({ plataforma_url: 'https://x.com', senha: ' Abc 123 ' });
    expect(r.success).toBe(true);
    expect(r.data.senha).toBe(' Abc 123 ');
    expect(scriptAcessoSchema.safeParse({ plataforma_url: 'https://x.com', senha: 'a'.repeat(501) }).success).toBe(false);
  });
});

describe('scriptMaterialsPessoaSchema (PUT parcial por pessoa)', () => {
  it('aceita body vazio (nada muda) e chaves isoladas', () => {
    expect(scriptMaterialsPessoaSchema.safeParse({}).success).toBe(true);
    const r = scriptMaterialsPessoaSchema.safeParse({ observacoes: 'ok' });
    expect(r.success).toBe(true);
    expect(r.data.links).toBeUndefined();
    expect(r.data.acessos).toBeUndefined();
  });

  it('valida links e acessos juntos e limita 10 acessos', () => {
    const acesso = { plataforma_url: 'https://a.com', login: 'u', senha: 'p', observacoes: '' };
    const ok = scriptMaterialsPessoaSchema.safeParse({
      links: [{ url: 'https://drive.google.com/x', rotulo: 'Drive', tipo: 'drive' }],
      acessos: [acesso],
    });
    expect(ok.success).toBe(true);
    expect(scriptMaterialsPessoaSchema.safeParse({ acessos: Array(11).fill(acesso) }).success).toBe(false);
    expect(scriptMaterialsPessoaSchema.safeParse({ links: [{ url: 'ftp://x' }] }).success).toBe(false);
  });
});

describe('cohortConfigSchema', () => {
  it('trim + default vazio', () => {
    expect(cohortConfigSchema.safeParse({}).data).toEqual({ prazo_materiais: '' });
    expect(cohortConfigSchema.safeParse({ prazo_materiais: '  até sexta  ' }).data.prazo_materiais).toBe('até sexta');
    expect(cohortConfigSchema.safeParse({ prazo_materiais: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('normalizeMaterials (JSON de script_fichas.materials)', () => {
  const A = 'a@x.com';
  const B = 'b@x.com';
  const shape = {
    por_pessoa: {
      'A@X.com': { links: [{ url: 'https://a', rotulo: '', tipo: 'outro' }], observacoes: 'de A', acessos: [{ plataforma_url: 'https://p', login: 'la', senha: 'SEGREDO-A', observacoes: '' }], submitted_at: '2026-09-03T10:00:00.000Z' },
      [B]: { links: [], observacoes: '', acessos: [], submitted_at: null },
    },
  };

  it('normaliza e-mail para minusculo e completa campos ausentes', () => {
    const m = normalizeMaterials(JSON.stringify({ por_pessoa: { 'C@X.COM': { links: [{ url: 'https://c' }] } } }));
    expect(Object.keys(m.por_pessoa)).toEqual(['c@x.com']);
    expect(m.por_pessoa['c@x.com']).toEqual({ links: [{ url: 'https://c' }], observacoes: '', acessos: [], submitted_at: null });
    expect(m.legado).toBeUndefined();
  });

  it('forma antiga (por clube) vira legado; forma antiga vazia nao vira nada', () => {
    const old = normalizeMaterials('{"links":[{"url":"https://drive","rotulo":"","tipo":"drive"}],"observacoes":"antigo"}');
    expect(old.por_pessoa).toEqual({});
    expect(old.legado).toEqual({ links: [{ url: 'https://drive', rotulo: '', tipo: 'drive' }], observacoes: 'antigo' });
    expect(normalizeMaterials('{"links":[],"observacoes":""}')).toEqual({ por_pessoa: {} });
    expect(normalizeMaterials('{}')).toEqual({ por_pessoa: {} });
    expect(normalizeMaterials(null)).toEqual({ por_pessoa: {} });
    expect(normalizeMaterials('nao e json')).toEqual({ por_pessoa: {} });
  });

  it('o membro ve so a propria entrada: nunca a do socio, nunca o legado', () => {
    const m = normalizeMaterials({ ...shape, legado: { links: [{ url: 'https://old' }], observacoes: 'clube' } });
    const viewB = memberMaterialsView(m, B);
    expect(viewB).toEqual({ links: [], observacoes: '', acessos: [], submitted_at: null });
    expect(JSON.stringify(viewB)).not.toContain('SEGREDO-A');
    expect(JSON.stringify(viewB)).not.toContain('https://old');
    const viewA = memberMaterialsView(m, 'A@x.com');
    expect(viewA.acessos[0].senha).toBe('SEGREDO-A');
    expect(viewA.submitted_at).toBe('2026-09-03T10:00:00.000Z');
    expect(memberMaterialsView(m, 'ninguem@x.com')).toEqual(emptyPessoa());
  });

  it('status e contagens sao por pessoa', () => {
    const m = normalizeMaterials(shape);
    expect(memberMaterialsStatus(m, A)).toBe('submitted');
    expect(memberMaterialsStatus(m, B)).toBe('pending');
    expect(countSubmitted(m)).toBe(1);
    expect(countItems(m)).toBe(2); // 1 link + 1 acesso
  });
});
