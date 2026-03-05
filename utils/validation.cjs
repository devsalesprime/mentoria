/**
 * Zod validation schemas for critical API endpoints.
 * Usage: const { validateBody } = require('./utils/validation.cjs');
 */
const { z } = require('zod');

// ─── Schemas ──────────────────────────────────────────────────────────────────

const verifyMemberSchema = z.object({
    email: z.string().email('Email inválido').max(320),
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
    validateBody,
};
