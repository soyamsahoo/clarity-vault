import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AaAccount,
  AaStatus,
  ApproveConsentInput,
  ConsentSummary,
  CreateConsentInput,
  FinancialProfile as FinancialProfileDto,
} from '@clarity/types';
import type { AAConsent, FinancialProfile, User } from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';

const SIMULATION_HINT =
  'Synthetic Account Aggregator sandbox. Enter OTP 123456. No bank or AA network is contacted.';

const AVAILABLE_ACCOUNTS: AaAccount[] = [
  {
    id: 'acct_hdfc_4412',
    bankName: 'HDFC Bank',
    accountType: 'Savings · salary account',
    maskedNumber: '•••• 4412',
    balance: 286_400,
    salaryCredited: true,
  },
  {
    id: 'acct_sbi_9081',
    bankName: 'State Bank of India',
    accountType: 'Savings',
    maskedNumber: '•••• 9081',
    balance: 94_200,
    salaryCredited: false,
  },
  {
    id: 'acct_icici_2204',
    bankName: 'ICICI Bank',
    accountType: 'Recurring deposit',
    maskedNumber: '•••• 2204',
    balance: 150_000,
    salaryCredited: false,
  },
];

function consentAccounts(consent: AAConsent): AaAccount[] {
  return (consent.accounts as unknown as AaAccount[]) ?? [];
}

function toConsentSummary(consent: AAConsent): ConsentSummary {
  return {
    id: consent.id,
    consentHandle: consent.consentHandle,
    status: consent.status,
    purpose: consent.purpose as ConsentSummary['purpose'],
    durationMonths: consent.durationMonths,
    dataRangeMonths: consent.dataRangeMonths,
    fiTypes: consent.fiTypes as ConsentSummary['fiTypes'],
    createdAt: consent.createdAt.toISOString(),
    approvedAt: consent.approvedAt?.toISOString() ?? null,
    expiresAt: consent.expiresAt?.toISOString() ?? null,
    revokedAt: consent.revokedAt?.toISOString() ?? null,
    lastFetchedAt: consent.lastFetchedAt?.toISOString() ?? null,
    accounts: consentAccounts(consent),
    simulationHint: SIMULATION_HINT,
    simulation: true,
  };
}

function toFinancialProfile(profile: FinancialProfile): FinancialProfileDto {
  return {
    id: profile.id,
    consentId: profile.consentId,
    monthlyIncome: profile.monthlyIncome,
    monthlyExpenses: profile.monthlyExpenses,
    existingEmi: profile.existingEmi,
    creditScore: profile.creditScore,
    employmentType: profile.employmentType,
    employer: profile.employer,
    bankName: profile.bankName,
    accountMasked: profile.accountMasked,
    averageBalance: profile.averageBalance,
    salaryCredits: profile.salaryCredits,
    dataQuality: profile.dataQuality,
    verifiedAt: profile.verifiedAt.toISOString(),
    incomeSources: profile.incomeSources as unknown as FinancialProfileDto['incomeSources'],
    monthlySeries: profile.monthlySeries as unknown as FinancialProfileDto['monthlySeries'],
    flags: profile.flags,
    simulation: true,
  };
}

function monthLabel(offset: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - offset);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(date);
}

@Injectable()
export class AccountAggregatorService {
  constructor(private readonly prisma: PrismaService) {}

  async status(user: User): Promise<AaStatus> {
    const consent = await this.prisma.aAConsent.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { financialProfile: true },
      orderBy: { approvedAt: 'desc' },
    });
    const linked = Boolean(
      consent?.financialProfile &&
        consent.expiresAt &&
        consent.expiresAt.getTime() > Date.now(),
    );

    return {
      linked,
      consent: consent ? toConsentSummary(consent) : null,
      profile: linked && consent?.financialProfile ? toFinancialProfile(consent.financialProfile) : null,
      availableAccounts: AVAILABLE_ACCOUNTS,
      simulation: true,
    };
  }

  async createConsent(user: User, input: CreateConsentInput): Promise<ConsentSummary> {
    const consent = await this.prisma.aAConsent.create({
      data: {
        userId: user.id,
        consentHandle: `AA-SIM-${Date.now().toString(36).toUpperCase()}-${Math.floor(
          Math.random() * 900 + 100,
        )}`,
        status: 'PENDING',
        purpose: input.purpose,
        durationMonths: input.durationMonths,
        dataRangeMonths: input.dataRangeMonths,
        fiTypes: input.fiTypes,
        accounts: AVAILABLE_ACCOUNTS as unknown as object,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AA_CONSENT_CREATED',
        entity: 'AAConsent',
        entityId: consent.id,
        metadata: { purpose: input.purpose, simulated: true },
      },
    });
    return toConsentSummary(consent);
  }

  async approve(
    user: User,
    consentId: string,
    input: ApproveConsentInput,
  ): Promise<AaStatus> {
    const consent = await this.prisma.aAConsent.findFirst({
      where: { id: consentId, userId: user.id },
    });
    if (!consent) throw new NotFoundException('Consent request not found.');
    if (consent.status === 'ACTIVE') throw new ForbiddenException('This consent is already active.');
    if (consent.status === 'REVOKED' || consent.status === 'EXPIRED') {
      throw new ForbiddenException('Create a new consent request to link your accounts.');
    }

    const selected = AVAILABLE_ACCOUNTS.filter((account) =>
      input.selectedAccountIds.includes(account.id),
    );
    if (selected.length === 0) throw new ForbiddenException('Select at least one valid account.');

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + consent.durationMonths);

    await this.prisma.aAConsent.updateMany({
      where: { userId: user.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now },
    });

    const updated = await this.prisma.aAConsent.update({
      where: { id: consent.id },
      data: {
        status: 'ACTIVE',
        approvedAt: now,
        expiresAt,
        lastFetchedAt: now,
        accounts: selected as unknown as object,
      },
    });

    const salaryAccount = selected.find((account) => account.salaryCredited) ?? selected[0];
    const monthlyIncome = salaryAccount?.salaryCredited ? 145_000 : 92_000;
    const monthlyExpenses = Math.round(monthlyIncome * 0.4);
    const months = [5, 4, 3, 2, 1, 0].map((offset) => monthLabel(offset));
    const series = months.map((month, index) => ({
      month,
      salary: monthlyIncome + (index % 2 === 0 ? 0 : 3_500) + (index === 3 ? 6_000 : 0),
      spend: monthlyExpenses + (index % 3 === 0 ? 4_000 : -1_500),
    }));

    await this.prisma.financialProfile.create({
      data: {
        userId: user.id,
        consentId: updated.id,
        monthlyIncome,
        monthlyExpenses,
        existingEmi: 8_500,
        creditScore: 782,
        employmentType: input.coApplicant ? 'SALARIED_PRIVATE' : 'STUDENT',
        employer: input.coApplicant ? 'Infosys Ltd · co-applicant (father)' : null,
        bankName: salaryAccount?.bankName ?? 'HDFC Bank',
        accountMasked: salaryAccount?.maskedNumber ?? '•••• 4412',
        averageBalance: salaryAccount?.balance ?? 286_400,
        salaryCredits: 6,
        dataQuality: 0.92,
        incomeSources: [
          {
            label: input.coApplicant ? 'Salary credit — co-applicant' : 'Verified salary credits',
            monthlyAmount: monthlyIncome,
            months: 6,
          },
        ],
        monthlySeries: series,
        flags: ['SALARY_CREDITS_CONSISTENT', 'NO_EMI_BOUNCE', 'AVERAGE_BALANCE_HEALTHY'],
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AA_CONSENT_APPROVED',
        entity: 'AAConsent',
        entityId: consent.id,
        metadata: { simulated: true, accounts: selected.length, coApplicant: input.coApplicant },
      },
    });

    return this.status(user);
  }

  async revoke(user: User, consentId: string): Promise<AaStatus> {
    const consent = await this.prisma.aAConsent.findFirst({
      where: { id: consentId, userId: user.id },
    });
    if (!consent) throw new NotFoundException('Consent not found.');
    if (consent.status === 'REVOKED') return this.status(user);
    await this.prisma.aAConsent.update({
      where: { id: consent.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AA_CONSENT_REVOKED',
        entity: 'AAConsent',
        entityId: consent.id,
        metadata: { simulated: true },
      },
    });
    return this.status(user);
  }

  async refresh(user: User): Promise<AaStatus> {
    const consent = await this.prisma.aAConsent.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { financialProfile: true },
      orderBy: { approvedAt: 'desc' },
    });
    if (!consent) throw new NotFoundException('Link an account before refreshing financial data.');
    if (consent.expiresAt && consent.expiresAt.getTime() < Date.now()) {
      await this.prisma.aAConsent.update({
        where: { id: consent.id },
        data: { status: 'EXPIRED' },
      });
      throw new ForbiddenException('This consent has expired. Create a new one to refresh data.');
    }
    await this.prisma.aAConsent.update({
      where: { id: consent.id },
      data: { lastFetchedAt: new Date() },
    });
    if (consent.financialProfile) {
      await this.prisma.financialProfile.update({
        where: { id: consent.financialProfile.id },
        data: { verifiedAt: new Date() },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AA_DATA_REFRESHED',
        entity: 'AAConsent',
        entityId: consent.id,
        metadata: { simulated: true },
      },
    });
    return this.status(user);
  }
}
