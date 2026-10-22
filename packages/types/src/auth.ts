import { z } from 'zod';
import { kycStatusSchema, userRoleSchema } from './common';

export const authUserSchema = z.object({
  id: z.string(),
  clerkId: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: userRoleSchema,
  kycStatus: kycStatusSchema,
  onboardingCompleted: z.boolean(),
  targetUniversityId: z.string().nullable(),
  targetProgramId: z.string().nullable(),
  targetLoanAmount: z.number().int().nonnegative().nullable(),
  familyIncomeAnnual: z.number().int().nonnegative().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
    .optional(),
  targetUniversityId: z.string().min(1).optional(),
  targetProgramId: z.string().min(1).optional(),
  targetLoanAmount: z.number().int().min(50_000).max(15_000_000).optional(),
  familyIncomeAnnual: z.number().int().min(0).max(100_000_000).optional(),
  onboardingCompleted: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const kycSubmitSchema = z.object({
  panLast4: z
    .string()
    .regex(/^[A-Z0-9]{4}$/i, 'Enter the last 4 characters of your PAN'),
  aadhaarLast4: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits of Aadhaar'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  consent: z
    .boolean()
    .refine((value) => value === true, { message: 'KYC consent is required' }),
});
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;

export const kycProfileSchema = z.object({
  status: kycStatusSchema,
  panMasked: z.string().nullable(),
  aadhaarMasked: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  method: z.string(),
  simulation: z.literal(true),
});
export type KycProfile = z.infer<typeof kycProfileSchema>;
