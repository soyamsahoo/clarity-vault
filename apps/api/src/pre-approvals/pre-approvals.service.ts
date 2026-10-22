import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BankOffer,
  PreApprovalRequest,
  PreApprovalRun,
  UnderwritingProfile,
} from '@clarity/types';
import { SIMULATION_DISCLAIMER } from '@clarity/types';
import {
  evaluatePolicies,
  findBestOffer,
  summariseOffers,
  type BankPolicyMatrix,
  type OfferWithBank,
  type UnderwritingApplicant,
} from '@clarity/utils';
import { Prisma, type User } from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';
import { CatalogService } from '../catalog/catalog.service';

const LOAN_DISCLAIMER = `${SIMULATION_DISCLAIMER} Pre-approval outcomes are simulated matches against seeded lender policy matrices.`;

const OFFER_INCLUDE = {
  bankPolicy: { include: { bank: true } },
} satisfies Prisma.LoanPreApprovalInclude;

type OfferRecord = Prisma.LoanPreApprovalGetPayload<{ include: typeof OFFER_INCLUDE }>;

function runKey(): string {
  return `run_${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, '0')}`;
}

function toBankOffer(record: OfferRecord): BankOffer {
  return {
    id: record.id,
    bankId: record.bankPolicy.bankId,
    bankName: record.bankPolicy.bank.name,
    bankCode: record.bankPolicy.bank.code,
    productName: record.bankPolicy.productName,
    logoInitials: record.bankPolicy.bank.logoInitials,
    accentColor: record.bankPolicy.bank.accentColor,
    status: record.status,
    approvedAmount: record.approvedAmount,
    interestRate: record.interestRate,
    tenureMonths: record.tenureMonths,
    emi: record.emi,
    totalInterest: record.totalInterest,
    processingFee: record.processingFee,
    confidence: record.confidence,
    reasons: record.reasons,
    conditions: record.conditions,
    collateralRequired: record.collateralRequired,
    coApplicantRequired: record.coApplicantRequired,
    foir: record.foir,
    notes: record.notes,
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

function profileDto(applicant: UnderwritingApplicant): UnderwritingProfile {
  return {
    creditScore: applicant.creditScore,
    monthlyIncome: applicant.monthlyIncome,
    monthlyExpenses: applicant.monthlyExpenses,
    existingEmi: applicant.existingEmi,
    employmentType: applicant.employmentType,
    employmentStabilityMonths: applicant.employmentStabilityMonths,
    coApplicant: applicant.coApplicant,
    collateralValue: applicant.collateralValue,
    dataQuality: applicant.dataQuality,
  };
}

@Injectable()
export class PreApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  private async financialContext(user: User) {
    const consent = await this.prisma.aAConsent.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { financialProfile: true },
      orderBy: { approvedAt: 'desc' },
    });
    if (!consent?.financialProfile) {
      throw new ForbiddenException(
        'Link a bank account through the simulated Account Aggregator before requesting pre-approvals.',
      );
    }
    return consent.financialProfile;
  }

  async run(user: User, input: PreApprovalRequest): Promise<PreApprovalRun> {
    const profile = await this.financialContext(user);
    const { program, cost } = await this.catalog.requireProgram(
      input.universityId,
      input.programId,
    );
    const requestAmount = Math.min(
      input.requestedAmount ?? user.targetLoanAmount ?? cost.grandTotal,
      cost.grandTotal,
    );

    const policies = await this.prisma.bankPolicy.findMany({
      where: { active: true },
      include: { bank: true },
    });
    if (policies.length === 0) {
      throw new NotFoundException('No active lender policies are configured.');
    }

    const hasIncome = input.coApplicant && profile.monthlyIncome > 0;
    const applicant: UnderwritingApplicant = {
      creditScore: profile.creditScore,
      monthlyIncome: hasIncome ? profile.monthlyIncome : 0,
      monthlyExpenses: profile.monthlyExpenses,
      existingEmi: profile.existingEmi,
      employmentType: hasIncome
        ? profile.employmentType === 'STUDENT'
          ? 'SALARIED_PRIVATE'
          : profile.employmentType
        : 'STUDENT',
      employmentStabilityMonths: profile.salaryCredits,
      coApplicant: input.coApplicant,
      collateralValue: input.collateralValue ?? null,
      dataQuality: profile.dataQuality,
    };

    const matrices: BankPolicyMatrix[] = policies.map((policy) => ({
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
    }));

    const decisions = evaluatePolicies(applicant, matrices, {
      requestedAmount: requestAmount,
      costOfStudy: cost.grandTotal,
      courseDurationMonths: program.durationMonths,
      moratoriumMonths: program.durationMonths + 6,
    });
    const best = findBestOffer(decisions);
    const runId = runKey();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    const created: OfferRecord[] = [];
    for (const decision of decisions) {
      const record = await this.prisma.loanPreApproval.create({
        data: {
          userId: user.id,
          bankPolicyId: decision.policyId,
          runId,
          universityId: input.universityId,
          programId: input.programId,
          requestedAmount: requestAmount,
          approvedAmount: decision.approvedAmount,
          interestRate: decision.interestRate,
          tenureMonths: decision.tenureMonths,
          emi: Math.round(decision.emi),
          totalInterest: decision.totalInterest,
          processingFee: decision.processingFee,
          confidence: decision.confidence,
          reasons: decision.reasons,
          conditions: decision.conditions,
          foir: decision.foir,
          collateralRequired: decision.collateralRequired,
          coApplicantRequired: decision.coApplicantRequired,
          status: decision.status,
          notes: [...decision.notes, `Decision ${decision.confidence * 100 > 80 ? 'high' : 'moderate'} confidence.`],
          expiresAt,
        },
        include: OFFER_INCLUDE,
      });
      created.push(record);
    }

    const bestRecord = best
      ? created.find((record) => record.bankPolicyId === best.policyId)
      : undefined;
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'PRE_APPROVAL_RUN',
        entity: 'LoanPreApproval',
        entityId: runId,
        metadata: {
          simulated: true,
          requestedAmount: requestAmount,
          offers: created.length,
          bestOffer: bestRecord?.bankPolicy.bank.name ?? null,
        },
      },
    });

    const offers = created.map(toBankOffer);
    const preApprovedCount = offers.filter((offer) => offer.status === 'PRE_APPROVED').length;
    const conditionalCount = offers.filter((offer) => offer.status === 'CONDITIONAL').length;
    const declinedCount = offers.filter((offer) => offer.status === 'DECLINED').length;

    return {
      runId,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      requestedAmount: requestAmount,
      allInCost: cost.grandTotal,
      profile: profileDto(applicant),
      offers,
      bestOfferId: bestRecord?.id ?? null,
      preApprovedCount,
      conditionalCount,
      declinedCount,
      summary: summariseOffers(
        decisions as OfferWithBank[],
        requestAmount,
      ),
      simulation: true,
      disclaimer: LOAN_DISCLAIMER,
    };
  }

  async latest(user: User): Promise<PreApprovalRun> {
    const newest = await this.prisma.loanPreApproval.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { runId: true },
    });
    if (!newest) throw new NotFoundException('No pre-approval run exists yet.');

    const records = await this.prisma.loanPreApproval.findMany({
      where: { userId: user.id, runId: newest.runId },
      include: OFFER_INCLUDE,
      orderBy: { confidence: 'desc' },
    });
    const first = records[0];
    if (!first) throw new NotFoundException('No pre-approval run exists yet.');

    const [profile, cost] = await Promise.all([
      this.financialContext(user),
      this.catalog.allInCost(first.universityId, first.programId),
    ]);
    const offers = records.map(toBankOffer);
    const preApproved = offers.filter((offer) => offer.status === 'PRE_APPROVED');
    const conditional = offers.filter((offer) => offer.status === 'CONDITIONAL');
    const best = [...(preApproved.length > 0 ? preApproved : conditional)].sort(
      (a, b) => b.confidence - a.confidence || a.interestRate - b.interestRate,
    )[0];

    return {
      runId: first.runId,
      generatedAt: first.createdAt.toISOString(),
      expiresAt: first.expiresAt?.toISOString() ?? first.createdAt.toISOString(),
      requestedAmount: first.requestedAmount,
      allInCost: cost.grandTotal,
      profile: profileDto({
        creditScore: profile.creditScore,
        monthlyIncome: profile.monthlyIncome,
        monthlyExpenses: profile.monthlyExpenses,
        existingEmi: profile.existingEmi,
        employmentType:
          profile.employmentType === 'STUDENT' ? 'SALARIED_PRIVATE' : profile.employmentType,
        employmentStabilityMonths: profile.salaryCredits,
        coApplicant: true,
        collateralValue: null,
        dataQuality: profile.dataQuality,
      }),
      offers,
      bestOfferId: best?.id ?? null,
      preApprovedCount: preApproved.length,
      conditionalCount: conditional.length,
      declinedCount: offers.filter((offer) => offer.status === 'DECLINED').length,
      summary:
        preApproved.length > 0
          ? `${preApproved.length} lender${preApproved.length > 1 ? 's' : ''} returned an indicative pre-approval. Best recorded rate ${Math.min(
              ...preApproved.map((offer) => offer.interestRate),
            ).toFixed(2)}%.`
          : conditional.length > 0
            ? `No clean pre-approvals. ${conditional.length} lender${conditional.length > 1 ? 's' : ''} could proceed with conditions.`
            : 'All lender policies declined this profile. Reduce the ask or add a co-applicant and retry.',
      simulation: true,
      disclaimer: LOAN_DISCLAIMER,
    };
  }

}
