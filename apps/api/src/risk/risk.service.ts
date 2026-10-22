import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  RiskResult,
  RiskSimulationRequest,
  StressMapRequest,
  StressMapResponse,
} from '@clarity/types';
import { SIMULATION_DISCLAIMER } from '@clarity/types';
import {
  buildRiskInput,
  buildStressMap,
  defaultRiskSeed,
  runRiskEngine,
} from '@clarity/utils';
import type { User } from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';
import { CatalogService } from '../catalog/catalog.service';

const RISK_DISCLAIMER = `${SIMULATION_DISCLAIMER} Distress probabilities are model output, not predictions or guarantees.`;

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  private async existingEmi(userId: string): Promise<number> {
    const profile = await this.prisma.financialProfile.findFirst({
      where: { userId },
      orderBy: { verifiedAt: 'desc' },
      select: { existingEmi: true },
    });
    return profile?.existingEmi ?? 0;
  }

  async simulate(user: User, request: RiskSimulationRequest): Promise<RiskResult> {
    const { program, cost, outcome } = await this.catalog.requireProgram(
      request.universityId,
      request.programId,
    );
    if (!outcome) {
      throw new NotFoundException('Verified placement outcomes are not available for this programme yet.');
    }
    const emi = await this.existingEmi(user.id);
    const principal = Math.min(
      request.loanAmount ?? user.targetLoanAmount ?? cost.grandTotal,
      15_000_000,
    );
    const seed = request.seed ?? defaultRiskSeed();
    const input = buildRiskInput({
      principal,
      courseDurationMonths: program.durationMonths,
      medianAnnualSalary: request.expectedSalaryOverride ?? outcome.medianSalary,
      placementRate: outcome.employmentRate,
      annualRate: request.annualRate ?? cost.financingEstimate.annualRate,
      tenureMonths: request.tenureMonths ?? cost.financingEstimate.tenureMonths,
      graceMonths: 6,
      existingEmi: emi,
      iterations: request.iterations,
      seed,
      aiHiringShockPct: request.aiHiringShockPct,
      jobDelayMonths: request.jobDelayMonths,
      rateHikeBps: request.rateHikeBps,
    });
    input.livingCostPct = request.livingCostPct ?? 32;

    const output = runRiskEngine(input);
    const generatedAt = new Date().toISOString();
    const result: RiskResult = {
      id: null,
      generatedAt,
      universityId: request.universityId,
      universityName: program.university.name,
      programId: request.programId,
      programName: program.name,
      inputs: output.inputs,
      metrics: output.metrics,
      scenarios: output.scenarios,
      cashflow: output.cashflow,
      dtiDistribution: output.dtiDistribution,
      stressMap: output.stressMap,
      narrative: output.narrative,
      sampling: output.sampling,
      simulation: true,
      disclaimer: RISK_DISCLAIMER,
    };

    const saved = await this.prisma.riskRun.create({
      data: {
        userId: user.id,
        universityId: request.universityId,
        programId: request.programId,
        seed,
        inputs: input,
        results: result,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'RISK_SIMULATION_RUN',
        entity: 'RiskRun',
        entityId: saved.id,
        metadata: {
          simulated: true,
          principal,
          probabilityOfDistress: output.metrics.probabilityOfDistress,
          seed,
        },
      },
    });

    return { ...result, id: saved.id };
  }

  async latest(user: User): Promise<RiskResult> {
    const run = await this.prisma.riskRun.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!run) throw new NotFoundException('Run a risk simulation first.');
    const stored = run.results as unknown as RiskResult;
    return { ...stored, id: run.id };
  }

  async stressMap(user: User, request: StressMapRequest): Promise<StressMapResponse> {
    const { program, cost, outcome } = await this.catalog.requireProgram(
      request.universityId,
      request.programId,
    );
    if (!outcome) {
      throw new NotFoundException('Verified placement outcomes are not available for this programme yet.');
    }
    const seed = request.seed ?? defaultRiskSeed();
    const input = buildRiskInput({
      principal: request.baseLoanAmount ?? user.targetLoanAmount ?? cost.grandTotal,
      courseDurationMonths: program.durationMonths,
      medianAnnualSalary: request.baseMonthlySalary
        ? request.baseMonthlySalary * 12
        : outcome.medianSalary,
      placementRate: outcome.employmentRate,
      annualRate: cost.financingEstimate.annualRate,
      tenureMonths: cost.financingEstimate.tenureMonths,
      seed,
      iterations: request.iterations,
    });
    const map = buildStressMap(input, { iterations: request.iterations, seed });
    return {
      salaryAxis: map.salaryAxis,
      loanAxis: map.loanAxis,
      cells: map.cells,
      safeThreshold: 0.2,
      note: 'Each cell runs the full path simulation for that salary/loan pair. Deterministic seed makes the map reproducible; yield values are simulated, not forecasts.',
      simulation: true,
    };
  }
}
