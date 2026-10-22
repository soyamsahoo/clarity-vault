import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { KycSubmitInput, UpdateProfileInput } from '@clarity/types';
import { PrismaService } from '../prisma/prisma.module';
import { toAuthUser, toKycProfile } from '../common/mappers';
import type { AuthUser, KycProfile } from '@clarity/types';
import type { User } from '@clarity/database';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secretKey: string | undefined;
  private readonly clerk: ReturnType<typeof createClerkClient> | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secretKey = config.get<string>('CLERK_SECRET_KEY') || undefined;
    this.clerk = this.secretKey ? createClerkClient({ secretKey: this.secretKey }) : null;
  }

  get isClerkEnabled(): boolean {
    return Boolean(this.clerk);
  }

  async resolveRequestUser(token: string | undefined): Promise<User> {
    if (!this.clerk || !this.secretKey) {
      return this.resolveDemoUser(token);
    }
    if (!token) {
      throw new UnauthorizedException('A Clerk session token is required.');
    }
    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey });
      const clerkId = payload.sub;
      if (!clerkId) throw new Error('Token missing subject');

      const existing = await this.prisma.user.findUnique({ where: { clerkId } });
      if (existing) return existing;

      const clerkUser = await this.clerk.users.getUser(clerkId);
      const email =
        clerkUser.emailAddresses.find(
          (address) => address.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        `${clerkId}@clerk.local`;
      const fullName =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
        clerkUser.username ||
        email.split('@')[0] ||
        'Clarity student';

      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        return this.prisma.user.update({
          where: { id: byEmail.id },
          data: { clerkId, fullName },
        });
      }

      return this.prisma.user.create({
        data: {
          clerkId,
          email,
          fullName,
          role: 'STUDENT',
          onboardingCompleted: false,
        },
      });
    } catch (error) {
      this.logger.warn(`Clerk verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Your session could not be verified. Please sign in again.');
    }
  }

  private async resolveDemoUser(token?: string): Promise<User> {
    const bare = token?.replace(/^Bearer\s+/i, '').replace(/^demo:/, '') ?? 'student';
    const clerkId = bare === 'student' ? 'demo_student' : bare === 'admin' ? 'demo_admin' : bare;
    const user = await this.prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      throw new UnauthorizedException(
        `Demo account "${clerkId}" not found. Run pnpm db:seed, or use "demo:student".`,
      );
    }
    return user;
  }

  toAuthUser(user: User): AuthUser {
    return toAuthUser(user);
  }

  getKyc(user: User): KycProfile {
    return toKycProfile(user);
  }

  async submitKyc(userId: string, input: KycSubmitInput): Promise<KycProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'VERIFIED',
        kycPanLast4: input.panLast4.toUpperCase(),
        kycAadhaarLast4: input.aadhaarLast4,
        kycVerifiedAt: new Date(),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_VERIFIED_SIMULATED',
        entity: 'User',
        entityId: userId,
        metadata: { method: 'SIMULATED_KYC' },
      },
    });
    return toKycProfile(user);
  }

  async updateProfile(user: User, input: UpdateProfileInput): Promise<AuthUser> {
    const universityId = input.targetUniversityId ?? user.targetUniversityId;
    const programId = input.targetProgramId ?? user.targetProgramId;

    if (input.targetProgramId) {
      const program = await this.prisma.program.findUnique({
        where: { id: input.targetProgramId },
        select: { universityId: true },
      });
      if (!program) throw new ForbiddenException('That programme does not exist.');
      if (universityId && program.universityId !== universityId) {
        throw new ForbiddenException('The selected programme belongs to another university.');
      }
    }

    if (input.onboardingCompleted) {
      if (!universityId || !programId) {
        throw new ForbiddenException('Choose a target university and programme to finish onboarding.');
      }
      if (!user.kycStatus || user.kycStatus === 'NOT_STARTED') {
        throw new ForbiddenException('Complete simulated KYC before finishing onboarding.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        targetUniversityId: input.targetUniversityId,
        targetProgramId: input.targetProgramId,
        targetLoanAmount: input.targetLoanAmount,
        familyIncomeAnnual: input.familyIncomeAnnual,
        onboardingCompleted: input.onboardingCompleted,
      },
    });
    return toAuthUser(updated);
  }
}
