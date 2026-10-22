import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminOverview,
  AdminStats,
  AdminUniversityRow,
  BankPolicy as BankPolicyDto,
  ReviewFeeSlipInput,
  UpdateBankPolicyInput,
  UpsertCostScheduleInput,
} from '@clarity/types';
import type { BankPolicy as BankPolicyRecord, User } from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';
import { FeeSlipsService } from '../fee-slips/fee-slips.service';
import { buildCost } from '../catalog/catalog.service';

const POLICY_INCLUDE = { bank: true } as const;

type BankPolicyWithBank = BankPolicyRecord & {
  bank: { id: string; name: string; code: string; logoInitials: string; accentColor: string };
};

function toPolicyDto(policy: BankPolicyWithBank): BankPolicyDto {
  return {
    id: policy.id,
    bankId: policy.bankId,
    bankName: policy.bank.name,
    bankCode: policy.bank.code,
    bankLogoInitials: policy.bank.logoInitials,
    bankAccentColor: policy.bank.accentColor,
    productName: policy.productName,
    minCreditScore: policy.minCreditScore,
    maxFoir: policy.maxFoir,
    minMonthlyIncome: policy.minMonthlyIncome,
    maxLoanAmount: policy.maxLoanAmount,
    minTenureMonths: policy.minTenureMonths,
    maxTenureMonths: policy.maxTenureMonths,
    baseRate: policy.baseRate,
    maxRate: policy.maxRate,
    requiresCoApplicant: policy.requiresCoApplicant,
    allowedEmploymentTypes: policy.allowedEmploymentTypes,
    maxLtv: policy.maxLtv,
    processingFeePct: policy.processingFeePct,
    collateralRequiredAbove: policy.collateralRequiredAbove,
    active: policy.active,
    notes: policy.notes,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feeSlips: FeeSlipsService,
  ) {}

  private async computeStats(): Promise<AdminStats> {
    const [
      universities,
      programs,
      bankPolicies,
      activePolicies,
      students,
      verifiedFeeSlips,
      pendingFeeSlips,
      certificatesIssued,
      preApprovalRuns,
      programsWithCosts,
    ] = await Promise.all([
      this.prisma.university.count(),
      this.prisma.program.count(),
      this.prisma.bankPolicy.count(),
      this.prisma.bankPolicy.count({ where: { active: true } }),
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.feeSlip.count({ where: { status: 'VERIFIED' } }),
      this.prisma.feeSlip.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      this.prisma.certificate.count(),
      this.prisma.loanPreApproval.findMany({ distinct: ['runId'], select: { runId: true } }),
      this.prisma.university.findMany({
        include: { programs: { include: { costSchedules: true } } },
      }),
    ]);

    const totals: number[] = [];
    for (const university of programsWithCosts) {
      for (const program of university.programs) {
        const cost = buildCost(program, university, program.costSchedules);
        if (cost.grandTotal > 0) totals.push(cost.grandTotal);
      }
    }

    return {
      universities,
      programs,
      bankPolicies,
      activePolicies,
      students,
      verifiedFeeSlips,
      pendingFeeSlips,
      certificatesIssued,
      preApprovalRuns: preApprovalRuns.length,
      averageAllInCost:
        totals.length > 0
          ? Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length)
          : null,
      simulation: true,
    };
  }

  async overview(): Promise<AdminOverview> {
    const [stats, policies, feeSlips, certificates] = await Promise.all([
      this.computeStats(),
      this.prisma.bankPolicy.findMany({ include: POLICY_INCLUDE, orderBy: { baseRate: 'asc' } }),
      this.prisma.feeSlip.findMany({
        include: { university: true, user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.certificate.findMany({
        include: {
          user: { select: { fullName: true } },
          university: { select: { name: true } },
        },
        orderBy: { issuedAt: 'desc' },
        take: 6,
      }),
    ]);

    return {
      stats,
      recentFeeSlips: feeSlips.map((slip) => ({
        id: slip.id,
        universityName: slip.university.name,
        submitterName: slip.user.fullName,
        total: slip.total,
        status: slip.status,
        submittedAt: slip.createdAt.toISOString(),
      })),
      recentCertificates: certificates.map((certificate) => ({
        id: certificate.id,
        studentName: certificate.user.fullName,
        universityName: certificate.university.name,
        verificationCode: certificate.verificationCode,
        issuedAt: certificate.issuedAt.toISOString(),
      })),
      policies: policies.map(toPolicyDto),
    };
  }

  async stats(): Promise<AdminStats> {
    return this.computeStats();
  }

  async universities(): Promise<AdminUniversityRow[]> {
    const rows = await this.prisma.university.findMany({
      include: {
        _count: { select: { programs: true, feeSlips: true } },
        programs: { select: { _count: { select: { costSchedules: true } } } },
      },
      orderBy: [{ verified: 'desc' }, { name: 'asc' }],
    });
    return rows.map((university) => ({
      id: university.id,
      slug: university.slug,
      name: university.name,
      shortName: university.shortName,
      type: university.type,
      city: university.city,
      state: university.state,
      nirfRank: university.nirfRank,
      verified: university.verified,
      programsCount: university._count.programs,
      costSchedulesCount: university.programs.reduce(
        (sum, program) => sum + program._count.costSchedules,
        0,
      ),
      feeSlipsCount: university._count.feeSlips,
      updatedAt: university.updatedAt.toISOString(),
    }));
  }

  async listFeeSlips(options: { status?: string; universityId?: string; limit?: number }) {
    return this.feeSlips.adminList(options);
  }

  async reviewFeeSlip(actor: User, id: string, input: ReviewFeeSlipInput) {
    return this.feeSlips.review(actor, id, input, { allowOwner: false });
  }

  async policies(): Promise<BankPolicyDto[]> {
    const policies = await this.prisma.bankPolicy.findMany({
      include: POLICY_INCLUDE,
      orderBy: [{ bank: { name: 'asc' } }, { baseRate: 'asc' }],
    });
    return policies.map(toPolicyDto);
  }

  async updatePolicy(
    actor: User,
    id: string,
    input: UpdateBankPolicyInput,
  ): Promise<BankPolicyDto> {
    const current = await this.prisma.bankPolicy.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Bank policy not found.');
    const nextBaseRate = input.baseRate ?? current.baseRate;
    const nextMaxRate = input.maxRate ?? current.maxRate;
    const nextMinTenure = input.minTenureMonths ?? current.minTenureMonths;
    const nextMaxTenure = input.maxTenureMonths ?? current.maxTenureMonths;
    if (nextBaseRate > nextMaxRate) {
      throw new BadRequestException('Base rate cannot exceed the maximum rate.');
    }
    if (nextMinTenure > nextMaxTenure) {
      throw new BadRequestException('Minimum tenure cannot exceed the maximum tenure.');
    }

    const updated = await this.prisma.bankPolicy.update({
      where: { id },
      data: {
        productName: input.productName,
        minCreditScore: input.minCreditScore,
        maxFoir: input.maxFoir,
        minMonthlyIncome: input.minMonthlyIncome,
        maxLoanAmount: input.maxLoanAmount,
        minTenureMonths: input.minTenureMonths,
        maxTenureMonths: input.maxTenureMonths,
        baseRate: input.baseRate,
        maxRate: input.maxRate,
        requiresCoApplicant: input.requiresCoApplicant,
        maxLtv: input.maxLtv,
        processingFeePct: input.processingFeePct,
        collateralRequiredAbove: input.collateralRequiredAbove,
        active: input.active,
        notes: input.notes,
      },
      include: POLICY_INCLUDE,
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'BANK_POLICY_UPDATED',
        entity: 'BankPolicy',
        entityId: id,
        metadata: { simulated: true, changes: input as object },
      },
    });
    return toPolicyDto(updated);
  }

  async upsertCostSchedule(actor: User, input: UpsertCostScheduleInput) {
    const program = await this.prisma.program.findUnique({
      where: { id: input.programId },
      select: { id: true, name: true },
    });
    if (!program) throw new NotFoundException('Programme not found.');
    const schedule = await this.prisma.costSchedule.upsert({
      where: {
        programId_academicYear: {
          programId: input.programId,
          academicYear: input.academicYear,
        },
      },
      create: {
        programId: input.programId,
        academicYear: input.academicYear,
        tuition: input.tuition,
        hostel: input.hostel,
        mess: input.mess,
        oneTime: input.oneTime,
        other: input.other,
        sourceLabel: input.sourceLabel,
        sourceType: input.sourceType,
        verified: input.verified,
      },
      update: {
        tuition: input.tuition,
        hostel: input.hostel,
        mess: input.mess,
        oneTime: input.oneTime,
        other: input.other,
        sourceLabel: input.sourceLabel,
        sourceType: input.sourceType,
        verified: input.verified,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COST_SCHEDULE_UPSERTED',
        entity: 'CostSchedule',
        entityId: schedule.id,
        metadata: {
          simulated: true,
          program: program.name,
          academicYear: input.academicYear,
          verified: input.verified,
        },
      },
    });
    return schedule;
  }
}
