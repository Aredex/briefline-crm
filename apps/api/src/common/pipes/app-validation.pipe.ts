// Global ValidationPipe — API-003 (PH-04).
//
// Strict validation for every DTO in the app:
//   - whitelist + forbidNonWhitelisted: unknown properties are an error
//     (mass-assignment protection, e.g. PATCH /profile only accepts `name`).
//   - transform with enableImplicitConversion: false (AP-51): type coercion is
//     explicit (@Type) instead of implicit.
//   - exceptionFactory maps class-validator errors into the RFC 9457
//     VALIDATION_ERROR shape with field-level `errors[]` (openapi-and-errors.md
//     §3): { field, message, code } where code is INVALID_FORMAT /
//     INVALID_LENGTH / INVALID_ENUM / UNKNOWN_PROPERTY.
import { BadRequestException, Injectable, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from 'class-validator'
import type { FieldError } from '../errors/app-errors'

function codeForConstraint(constraint: string): string {
  switch (constraint) {
    case 'whitelistValidation':
      return 'UNKNOWN_PROPERTY'
    case 'isEnum':
      return 'INVALID_ENUM'
    case 'isLength':
    case 'minLength':
    case 'maxLength':
    case 'isNotEmpty':
      return 'INVALID_LENGTH'
    default:
      return 'INVALID_FORMAT'
  }
}

@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      forbidUnknownValues: true,
      exceptionFactory: (validationErrors: ValidationError[]) => {
        const errors: FieldError[] = []
        const walk = (items: ValidationError[], prefix = ''): void => {
          for (const item of items) {
            const field = prefix ? `${prefix}.${item.property}` : item.property
            if (item.constraints) {
              const constraintNames = Object.keys(item.constraints)
              const first = constraintNames[0]
              errors.push({
                field,
                message: (first ? item.constraints[first] : 'Invalid value') ?? 'Invalid value',
                code: codeForConstraint(first ?? ''),
              })
            }
            if (item.children?.length) {
              walk(item.children, field)
            }
          }
        }
        walk(validationErrors)
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          detail: 'Request validation failed.',
          errors,
        })
      },
    })
  }
}
