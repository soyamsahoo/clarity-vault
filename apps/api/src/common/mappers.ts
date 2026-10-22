import type { AuthUser, KycProfile } from '@clarity/types';
import type { User } from '@clarity/database';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    kycStatus: user.kycStatus,
    onboardingCompleted: user.onboardingCompleted,
    targetUniversityId: user.targetUniversityId,
    targetProgramId: user.targetProgramId,
    targetLoanAmount: user.targetLoanAmount,
    familyIncomeAnnual: user.familyIncomeAnnual,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toKycProfile(user: User): KycProfile {
  return {
    status: user.kycStatus,
    panMasked: user.kycPanLast4 ? `••••••${user.kycPanLast4}` : null,
    aadhaarMasked: user.kycAadhaarLast4 ? `•••• •••• ${user.kycAadhaarLast4}` : null,
    verifiedAt: user.kycVerifiedAt?.toISOString() ?? null,
    method: 'SIMULATED_KYC',
    simulation: true,
  };
}
