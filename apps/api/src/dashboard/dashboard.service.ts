import { Injectable } from '@nestjs/common';
import type { Dashboard } from '@clarity/types';
import { formatInr, formatPercent } from '@clarity/utils';
import type { User } from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';
import { CatalogService } from '../catalog/catalog.service';
import { FeeSlipsService } from '../fee-slips/fee-slips.service';
import { CertificatesService } from '../certificates/certificates.service';
import { AccountAggregatorService } from '../account-aggregator/account-aggregator.service';
import { PreApprovalsService } from '../pre-approvals/pre-approvals.service';
import { RiskService } from '../risk/risk.service';
import { toAuthUser } from '../common/mappers';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly feeSlips: FeeSlipsService,
    private readonly certificates: CertificatesService,
    private readonly aa: AccountAggregatorService,
    private readonly preApprovals: PreApprovalsService,
    private readonly risk: RiskService,
  ) {}

  async get(user: User): Promise<Dashboard> {
    const [feeSlips, certificateList, aaStatus, latestRun, latestRisk, certificateCount] =
      await Promise.all([
        this.feeSlips.listMine(user.id),
        this.certificates.listMine(user.id),
        this.aa.status(user),
        this.preApprovals.latest(user).catch(() => null),
        this.risk.latest(user).catch(() => null),
        this.prisma.certificate.count({ where: { userId: user.id, status: 'ACTIVE' } }),
      ]);

    const verifiedSlips = feeSlips.filter((slip) => slip.status === 'VERIFIED');
    const target = await this.buildTarget(user);
    const bestOffer =
      latestRun?.offers.find((offer) => offer.id === latestRun.bestOfferId) ??
      latestRun?.offers.find((offer) => offer.status === 'PRE_APPROVED') ??
      null;

    const hasKyc = user.kycStatus === 'VERIFIED';
    const hasTarget = Boolean(target);
    const hasAa = aaStatus.linked;
    const hasFeeSlip = verifiedSlips.length > 0;
    const hasRisk = Boolean(latestRisk);
    const hasCertificate = certificateCount > 0;

    const factors = [
      {
        key: 'kyc',
        label: 'Identity verified',
        detail: hasKyc
          ? 'Pan and Aadhaar verified in simulated KYC.'
          : 'Complete KYC so peer fee slips can be trusted.',
        weight: 20,
        complete: hasKyc,
      },
      {
        key: 'target',
        label: 'Target programme chosen',
        detail: hasTarget
          ? `${target?.university.shortName ?? ''} · ${target?.program.name ?? ''}`
          : 'Pick a university and programme to anchor your cost model.',
        weight: 20,
        complete: hasTarget,
      },
      {
        key: 'aa',
        label: 'Bank data linked',
        detail: hasAa
          ? 'Account Aggregator consent active (simulated).'
          : 'Link income data to unlock lender matching.',
        weight: 20,
        complete: hasAa,
      },
      {
        key: 'fee-slip',
        label: 'Cost corroborated',
        detail: hasFeeSlip
          ? `${verifiedSlips.length} verified fee slip${verifiedSlips.length > 1 ? 's' : ''} match the schedule.`
          : 'Upload one fee receipt to raise cost certainty.',
        weight: 15,
        complete: hasFeeSlip,
      },
      {
        key: 'risk',
        label: 'Repayment stress-tested',
        detail: hasRisk
          ? 'A deterministic risk simulation is on file.'
          : 'Run the what-if engine before you borrow.',
        weight: 15,
        complete: hasRisk,
      },
      {
        key: 'certificate',
        label: 'Certificate issued',
        detail: hasCertificate
          ? 'A verifiable cost certificate is active.'
          : 'Issue a certificate once costs are verified.',
        weight: 10,
        complete: hasCertificate,
      },
    ];

    const score = factors.reduce((sum, factor) => sum + (factor.complete ? factor.weight : 0), 0);
    const label =
      score >= 85 ? 'Funding ready' : score >= 55 ? 'Strong base' : score >= 30 ? 'Getting started' : 'Orientation';

    const actions: Dashboard['actions'] = [];
    if (!hasKyc) {
      actions.push({
        id: 'kyc',
        title: 'Verify your identity',
        description: 'Aadhaar + PAN checks take 30 seconds in demo mode.',
        cta: 'Complete KYC',
        route: '/kyc',
        priority: 'HIGH',
        complete: false,
      });
    }
    if (!hasTarget) {
      actions.push({
        id: 'target',
        title: 'Choose your target programme',
        description: 'Costs and salary ranges are programme-specific. Start there.',
        cta: 'Pick a university',
        route: '/onboarding/target',
        priority: 'HIGH',
        complete: false,
      });
    }
    if (!hasAa) {
      actions.push({
        id: 'aa',
        title: 'Link a bank account',
        description: 'Unlock verified income and lender pre-approvals (simulated AA).',
        cta: 'Link account',
        route: '/account-aggregator',
        priority: 'HIGH',
        complete: false,
      });
    }
    if (!hasFeeSlip && hasTarget) {
      actions.push({
        id: 'fee-slip',
        title: 'Upload a fee receipt',
        description: 'Peer verification raises confidence in the all-in cost.',
        cta: 'Upload slip',
        route: '/fee-slips/new',
        priority: 'MEDIUM',
        complete: false,
      });
    }
    if (hasAa && hasTarget && !latestRun) {
      actions.push({
        id: 'pre-approval',
        title: 'See which lenders would say yes',
        description: 'Compare indicative offers against six policy matrices.',
        cta: 'Run matching',
        route: '/pre-approvals',
        priority: 'HIGH',
        complete: false,
      });
    }
    if (hasTarget && !hasRisk) {
      actions.push({
        id: 'risk',
        title: 'Stress-test the EMI',
        description: '10,000 simulated futures, including an AI hiring shock.',
        cta: 'Run simulation',
        route: '/risk',
        priority: 'MEDIUM',
        complete: false,
      });
    }
    if (hasTarget && !hasCertificate) {
      actions.push({
        id: 'certificate',
        title: 'Issue a cost certificate',
        description: 'A shareable, verifiable record of the verified cost.',
        cta: 'Issue certificate',
        route: '/certificates',
        priority: 'LOW',
        complete: false,
      });
    }
    if (actions.length === 0) {
      actions.push({
        id: 'review',
        title: 'Review your funding plan',
        description: 'Everything is in place. Check the latest risk run before you commit.',
        cta: 'Open risk lab',
        route: '/risk',
        priority: 'LOW',
        complete: true,
      });
    }

    const stats = {
      grandTotal: target?.cost.grandTotal ?? null,
      loanRequired: user.targetLoanAmount ?? target?.cost.grandTotal ?? null,
      estimatedEmi: target?.cost.financingEstimate.monthlyEmi ?? null,
      medianSalary: target?.outcome?.medianSalary ?? null,
      verifiedSlipCount: verifiedSlips.length,
      certificateCount,
    };

    let insight = 'Choose a target programme to turn scattered cost data into a plan.';
    if (target?.outcome) {
      const monthlySalary = Math.round(target.outcome.medianSalary / 12);
      const emiShare = monthlySalary > 0 ? target.cost.financingEstimate.monthlyEmi / monthlySalary : 0;
      insight = `At the ${target.university.shortName} median starting salary of ${formatInr(
        monthlySalary,
      )}/month, the modelled EMI is ${formatPercent(emiShare)} of take-home. ${
        target.outcome.aiRiskLabel === 'HIGH' || target.outcome.aiRiskLabel === 'SEVERE'
          ? 'AI exposure is material — keep a co-applicant buffer.'
          : 'AI exposure is contained for this role family.'
      }`;
    } else if (target) {
      insight = `Cost data for ${target.university.shortName} is ready, but placement outcomes are still thin.`;
    } else if (!hasKyc) {
      insight = 'Start with simulated KYC. It unlocks peer fee slips, bank linking and certificates.';
    }

    return {
      user: toAuthUser(user),
      target,
      readiness: { score, label, factors },
      actions,
      certificate: certificateList[0] ?? null,
      feeSlips: feeSlips.slice(0, 4),
      aa: {
        linked: aaStatus.linked,
        monthlyIncome: aaStatus.profile?.monthlyIncome ?? null,
        creditScore: aaStatus.profile?.creditScore ?? null,
        verifiedAt: aaStatus.profile?.verifiedAt ?? null,
      },
      bestOffer,
      offerCount: latestRun?.offers.length ?? 0,
      risk: latestRisk
        ? {
            id: latestRisk.id,
            riskBand: latestRisk.metrics.riskBand,
            resilienceScore: latestRisk.metrics.resilienceScore,
            probabilityOfDistress: latestRisk.metrics.probabilityOfDistress,
            monthlySurplus: Math.round(
              latestRisk.metrics.firstYearSalary.p50 / 12 -
                latestRisk.metrics.firstYearSalary.p50 / 12 * (latestRisk.inputs.livingCostPct / 100) -
                latestRisk.metrics.monthlyEmi -
                latestRisk.inputs.existingEmi,
            ),
            generatedAt: latestRisk.generatedAt,
          }
        : null,
      stats,
      insight,
      updatedAt: new Date().toISOString(),
      simulation: true,
    };
  }

  private async buildTarget(user: User): Promise<Dashboard['target']> {
    if (!user.targetUniversityId || !user.targetProgramId) return null;
    try {
      const detail = await this.catalog.detail(user.targetUniversityId);
      const program = detail.programs.find((item) => item.id === user.targetProgramId);
      if (!program) return null;
      const { description, website, address, accreditation, programs, feeSlipPulse, outcomeOverview, simulation, ...summary } =
        detail;
      const [cost, outcome] = await Promise.all([
        this.catalog.allInCost(detail.id, program.id),
        this.catalog.outcome(detail.id, program.id).catch(() => null),
      ]);
      return {
        university: summary,
        program: {
          id: program.id,
          name: program.name,
          degree: program.degree,
          durationMonths: program.durationMonths,
        },
        cost,
        outcome,
      };
    } catch {
      return null;
    }
  }
}
