/**
 * Zod validation schemas for critical API endpoints.
 * Usage: const { validateBody } = require('./utils/validation.cjs');
 */
const { z } = require('zod');

// ─── Schemas ──────────────────────────────────────────────────────────────────

// E-mail normalizado (trim + minusculo): evita duas linhas em users para a mesma pessoa
const verifyMemberSchema = z.object({
    email: z.string().trim().toLowerCase().email('Email inválido').max(320),
});

const adminLoginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
});

const saveDiagnosticSchema = z.object({
    moduleId: z.string().min(1),
    stepIndex: z.number().int().min(0),
    data: z.record(z.unknown()),
});

const submitDiagnosticSchema = z.object({
    diagnosticData: z.object({
        preModule: z.record(z.unknown()).optional().default({}),
        mentor: z.record(z.unknown()).optional().default({}),
        mentee: z.record(z.unknown()).optional().default({}),
        method: z.record(z.unknown()).optional().default({}),
        offer: z.record(z.unknown()).optional().default({}),
    }),
});

const brandBrainSaveSchema = z.object({
    sectionId: z.string().optional(),
    content: z.string().optional(),
});

const pipelineResearchSchema = z.object({
    researchDossier: z.record(z.unknown()),
});

const pipelineBrandBrainSchema = z.union([
    z.object({ brandBrain: z.record(z.unknown()) }),
    z.object({ status: z.string() }),
]);

// ─── Script 7 Passos (ficha por clube) ────────────────────────────────────────

const scriptFieldUpdateSchema = z.object({
    valor: z.string().max(20000).optional(),
    status: z.enum(['confirmado', 'editado', 'aceito_vazio', 'sugerido', 'vazio']),
    // JSON do widget (components/script/widgets); guardado ao lado do valor quando status = editado
    estrutura: z.record(z.string(), z.any()).optional(),
});

const scriptFieldsUpdateSchema = z.object({
    updates: z.record(z.string().max(8), scriptFieldUpdateSchema)
        .refine((u) => Object.keys(u).length > 0, 'updates vazio')
        .refine((u) => Object.keys(u).length <= 34, 'updates grande demais'),
});

const scriptMaterialLinkSchema = z.object({
    url: z.string().max(2000).refine((v) => /^https?:\/\//i.test(v), 'URL deve começar com http:// ou https://'),
    rotulo: z.string().max(200).optional().default(''),
    tipo: z.enum(['drive', 'site', 'plataforma', 'outro']).optional().default('outro'),
});

const scriptMaterialsSchema = z.object({
    links: z.array(scriptMaterialLinkSchema).max(50).optional().default([]),
    observacoes: z.string().max(5000).optional().default(''),
});

const scriptPrefillAlternativaSchema = z.object({
    sugerido: z.string().max(20000),
    fonte: z.string().max(1000).optional().default(''),
});

const scriptPrefillCampoSchema = z.object({
    sugerido: z.string().max(20000).optional().default(''),
    classe: z.enum(['Fato', 'DER', 'VZ']),
    fonte: z.string().max(1000).optional().default(''),
    alternativas: z.array(scriptPrefillAlternativaSchema).optional().default([]),
    nota_interna: z.string().max(5000).optional().default(''),
});

// Contrato: CONTRATO-prefill-json.md (campos 1.1 a 6.7; regras extras no route)
const scriptPrefillSchema = z.object({
    club_slug: z.string().max(100).optional(),
    club_nome: z.string().max(200).optional(),
    membros: z.array(z.string().max(320)).optional().default([]),
    gerado_em: z.string().max(40).optional(),
    gerado_por: z.string().max(100).optional(),
    fontes_lidas: z.array(z.string().max(500)).optional().default([]),
    campos: z.record(z.string().max(8), scriptPrefillCampoSchema),
});

const cohortMembersSchema = z.object({
    nome: z.string().min(1).max(200).optional(),
    ativo: z.union([z.literal(0), z.literal(1)]).optional(),
    add: z.array(z.object({
        email: z.string().email('Email inválido').max(320),
        nome: z.string().max(200).optional(),
    })).max(50).optional().default([]),
    remove: z.array(z.string().email('Email inválido').max(320)).max(50).optional().default([]),
});

// ─── Middleware helper ────────────────────────────────────────────────────────

/**
 * Express middleware factory: validates req.body against a zod schema.
 * On success, replaces req.body with parsed (typed) data.
 * On failure, responds 400 with structured error.
 */
function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            return res.status(400).json({
                success: false,
                message: 'Dados inválidos',
                errors,
            });
        }
        req.body = result.data;
        next();
    };
}

module.exports = {
    verifyMemberSchema,
    adminLoginSchema,
    saveDiagnosticSchema,
    submitDiagnosticSchema,
    brandBrainSaveSchema,
    pipelineResearchSchema,
    pipelineBrandBrainSchema,
    scriptFieldsUpdateSchema,
    scriptMaterialsSchema,
    scriptPrefillSchema,
    cohortMembersSchema,
    validateBody,
};
