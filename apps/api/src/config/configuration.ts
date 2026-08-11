// Environment configuration — API-003 (PH-04).
//
// Blocking Joi validation: the app refuses to boot when a required variable is
// missing or an undeclared variable appears in the loaded .env file (typo
// protection, AP-52). JWT_SECRET/CSRF_SECRET are required in EVERY environment
// — no defaults — so a missing secret fails fast instead of signing with a
// guessable value (production) or silently using an empty one (local).
//
// Implementation note (validateEnv): @nestjs/config 4.x merges the WHOLE
// process.env into the object handed to the validation function (config.module
// dist: `config = { ...config, ...process.env }` before validation). Running
// `validationSchema` with allowUnknown:false directly would therefore reject
// any shell that exports unrelated variables (PATH, CI-provided vars, ...).
// validateEnv restricts the validated universe to the declared keys while
// keeping the same strict options (allowUnknown:false + abortEarly:true), so
// undeclared variables in the .env file still fail the boot.
import * as Joi from 'joi'

/** Keys the application declares and consumes. */
export const DECLARED_ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'CSRF_SECRET',
  'CORS_ORIGINS',
] as const

export const configurationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  CSRF_SECRET: Joi.string().min(32).required(),
  CORS_ORIGINS: Joi.string().required().default('http://localhost:5173'),
})

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const declared: Record<string, unknown> = {}
  for (const key of DECLARED_ENV_KEYS) {
    if (key in config) {
      declared[key] = config[key]
    }
  }
  const { error, value } = configurationSchema.validate(declared, {
    allowUnknown: false, // undeclared .env variables are a boot error (AP-52)
    abortEarly: true, // stop at the first validation error
  })
  if (error) {
    throw new Error(`Config validation error: ${error.message}`)
  }
  return value
}
