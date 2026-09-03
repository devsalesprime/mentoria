// @ts-nocheck
import { verifyMemberSchema } from '../../utils/validation.cjs';

describe('verifyMemberSchema (login)', () => {
  it('normaliza o e-mail: trim + minusculo', () => {
    const r = verifyMemberSchema.safeParse({ email: '  JULIO.Filho@Ceramfix.com.br ' });
    expect(r.success).toBe(true);
    expect(r.data.email).toBe('julio.filho@ceramfix.com.br');
  });

  it('rejeita e-mail invalido', () => {
    expect(verifyMemberSchema.safeParse({ email: 'nao-e-email' }).success).toBe(false);
  });
});
