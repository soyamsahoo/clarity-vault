import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AllInCost,
  FeeSlipPulse,
  OutcomeOracle,
  ProgramSummary,
  UniversityDetail,
  UniversityListQuery,
  UniversityListResponse,
  UniversitySummary,
  UniversityType,
} from '@clarity/types';
import {
  aiRiskFromExposure,
  computeCostCertainty,
  triangulateOutcomes,
  type CostScheduleRow,
  type OutcomeRowInput,
} from '@clarity/utils';
import {
  Prisma,
  type CostSchedule,
  type OutcomeData,
  type Program,
  type University,
} from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';

const UNIVERSITY_INCLUDE = {
  programs: {
    include: {
      costSchedules: { orderBy: { academicYear: 'asc' } },
      outcomes: true,
    },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.UniversityInclude;

type UniversityWithPrograms = Prisma.UniversityGetPayload<{
  include: typeof UNIVERSITY_INCLUDE;
}>;
type ProgramWithCosts = UniversityWithPrograms['programs'][number];

function scheduleRows(rows: CostSchedule[]): CostScheduleRow[] {
  return rows.map((row) => ({
    academicYear: row.academicYear,
    tuition: row.tuition,
    hostel: row.hostel,
    mess: row.mess,
    oneTime: row.oneTime,
    other: row.other,
    verified: row.verified,
    sourceType: row.sourceType,
    sourceLabel: row.sourceLabel,
    updatedAt: row.updatedAt,
  }));
}

export function buildCost(
  program: Pick<Program, 'id' | 'name' | 'degree' | 'durationMonths'>,
  university: Pick<University, 'id' | 'name'>,
  schedules: CostSchedule[],
  feeSlips: Array<{ academicYear: string; total: number; reviewedAt: Date | null }> = [],
): AllInCost {
  const certainty = computeCostCertainty({
    durationMonths: program.durationMonths,
    schedules: scheduleRows(schedules),
    feeSlips: feeSlips.map((slip) => ({
      academicYear: slip.academicYear,
      total: slip.total,
      verifiedAt: slip.reviewedAt,
    })),
    annualEscalationPct: 5,
    loanRate: 10.5,
    loanTenureMonths: 120,
    graceMonths: 6,
  });

  return {
    universityId: university.id,
    universityName: university.name,
    programId: program.id,
    programName: program.name,
    degree: program.degree,
    durationMonths: program.durationMonths,
    durationYears: certainty.durationYears,
    currency: 'INR',
    academicYears: certainty.academicYears,
    breakdown: certainty.breakdown,
    tuitionTotal: certainty.tuitionTotal,
    livingTotal: certainty.livingTotal,
    oneTimeTotal: certainty.oneTimeTotal,
    otherTotal: certainty.otherTotal,
    grandTotal: certainty.grandTotal,
    averageAnnualCost: certainty.averageAnnualCost,
    annualEscalationPct: certainty.annualEscalationPct,
    financingEstimate: {
      principal: certainty.financingEstimate.principal,
      annualRate: certainty.financingEstimate.annualRate,
      tenureMonths: certainty.financingEstimate.tenureMonths,
      monthlyEmi: certainty.financingEstimate.monthlyEmi,
      totalInterest: certainty.financingEstimate.totalInterest,
      totalRepayment: certainty.financingEstimate.totalRepayment,
      moratoriumMonths: certainty.financingEstimate.moratoriumMonths,
    },
    confidence: certainty.confidence,
    sources: certainty.sources,
    lastUpdated: certainty.lastUpdated,
  };
}

export function buildOutcome(
  program: Pick<Program, 'id' | 'name'>,
  rows: OutcomeData[],
): OutcomeOracle | null {
  if (rows.length === 0) return null;
  const sources: OutcomeRowInput[] = rows.map((row) => ({
    id: row.id,
    type: row.sourceType,
    label: row.sourceLabel,
    year: row.year,
    sampleSize: row.sampleSize,
    placementRate: row.placementRate,
    medianSalary: row.medianSalary,
    p25Salary: row.p25Salary,
    p75Salary: row.p75Salary,
    confidence: row.confidence,
    notes: row.notes,
  }));
  const aggregate = triangulateOutcomes(sources);
  const aiExposure =
    rows.reduce((sum, row) => sum + row.aiExposureIndex, 0) / Math.max(1, rows.length);
  const recruiters = Array.from(new Set(rows.flatMap((row) => row.topRecruiters))).slice(0, 8);
  const lastUpdated = rows.reduce<Date>(
    (latest, row) => (row.createdAt > latest ? row.createdAt : latest),
    new Date(0),
  );

  return {
    universityId: rows[0]?.universityId ?? '',
    programId: program.id,
    programName: program.name,
    employmentRate: aggregate.employmentRate,
    medianSalary: aggregate.medianSalary,
    p25Salary: aggregate.p25Salary,
    p75Salary: aggregate.p75Salary,
    salaryGrowthPct: 8,
    topRecruiters: recruiters,
    aiExposureIndex: Number(aiExposure.toFixed(2)),
    aiRiskLabel: aiRiskFromExposure(aiExposure),
    confidence: aggregate.confidence,
    totalSampleSize: aggregate.totalSampleSize,
    sources: rows.map((row) => ({
      id: row.id,
      type: row.sourceType,
      label: row.sourceLabel,
      year: row.year,
      sampleSize: row.sampleSize,
      placementRate: row.placementRate,
      medianSalary: row.medianSalary,
      p25Salary: row.p25Salary,
      p75Salary: row.p75Salary,
      confidence: row.confidence,
      notes: row.notes,
    })),
    methodology: aggregate.methodology,
    lastUpdated: lastUpdated.toISOString(),
  };
}

function summaryForUniversity(university: UniversityWithPrograms): UniversitySummary {
  const programData = university.programs
    .map((program) => {
      const cost = buildCost(program, university, program.costSchedules);
      const outcome = buildOutcome(program, program.outcomes);
      return { program, cost, outcome };
    })
    .filter((item) => item.cost.grandTotal > 0);

  const cheapest = [...programData].sort((a, b) => a.cost.grandTotal - b.cost.grandTotal)[0];
  const withOutcome = programData.filter((item) => item.outcome);
  const top = [...withOutcome].sort((a, b) => {
    const aRoi = (a.outcome?.medianSalary ?? 0) / Math.max(1, a.cost.grandTotal);
    const bRoi = (b.outcome?.medianSalary ?? 0) / Math.max(1, b.cost.grandTotal);
    return bRoi - aRoi;
  })[0];
  const median = top?.outcome?.medianSalary ?? null;
  const placement = top?.outcome?.employmentRate ?? null;

  return {
    id: university.id,
    slug: university.slug,
    name: university.name,
    shortName: university.shortName,
    type: university.type,
    city: university.city,
    state: university.state,
    nirfRank: university.nirfRank,
    established: university.established,
    logoInitials: university.logoInitials,
    accentColor: university.accentColor,
    verified: university.verified,
    programsCount: university.programs.length,
    stemProgramsCount: university.programs.filter((program) => program.stem).length,
    allInCostFrom: cheapest?.cost.grandTotal ?? null,
    medianSalary: median,
    placementRate: placement,
    outcomeConfidence: top?.outcome?.confidence ?? null,
    topProgram: top
      ? {
          id: top.program.id,
          name: top.program.name,
          degree: top.program.degree,
          allInCost: top.cost.grandTotal,
          medianSalary: top.outcome?.medianSalary ?? null,
        }
      : null,
  };
}

function programSummary(program: ProgramWithCosts, university: University): ProgramSummary {
  const cost = buildCost(program, university, program.costSchedules);
  const outcome = buildOutcome(program, program.outcomes);
  return {
    id: program.id,
    universityId: program.universityId,
    name: program.name,
    degree: program.degree,
    discipline: program.discipline,
    durationMonths: program.durationMonths,
    seats: program.seats,
    stem: program.stem,
    medianSalary: outcome?.medianSalary ?? null,
    allInCost: cost.grandTotal > 0 ? cost.grandTotal : null,
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UniversityListQuery): Promise<UniversityListResponse> {
    const where: Prisma.UniversityWhereInput = {};
    if (query.type) where.type = query.type as UniversityType;
    if (query.state) where.state = { equals: query.state, mode: 'insensitive' };
    if (query.search) {
      const search = query.search;
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shortName: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { state: { contains: search, mode: 'insensitive' } },
        { programs: { some: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [rows, allUniversities] = await Promise.all([
      this.prisma.university.findMany({
        where,
        include: UNIVERSITY_INCLUDE,
      }),
      this.prisma.university.findMany({ select: { state: true, type: true } }),
    ]);

    const summaries = rows.map(summaryForUniversity);
    const sort = query.sort ?? 'recommended';
    summaries.sort((a, b) => {
      switch (sort) {
        case 'cost_asc':
          return (a.allInCostFrom ?? Number.MAX_SAFE_INTEGER) - (b.allInCostFrom ?? Number.MAX_SAFE_INTEGER);
        case 'cost_desc':
          return (b.allInCostFrom ?? 0) - (a.allInCostFrom ?? 0);
        case 'salary_desc':
          return (b.medianSalary ?? 0) - (a.medianSalary ?? 0);
        case 'roi_desc': {
          const aRoi = (a.medianSalary ?? 0) / Math.max(1, a.allInCostFrom ?? 1);
          const bRoi = (b.medianSalary ?? 0) / Math.max(1, b.allInCostFrom ?? 1);
          return bRoi - aRoi;
        }
        default:
          return (
            Number(b.verified) - Number(a.verified) ||
            (a.nirfRank ?? 999) - (b.nirfRank ?? 999) ||
            a.name.localeCompare(b.name)
          );
      }
    });

    const limited = summaries.slice(0, query.limit ?? 24);
    return {
      items: limited,
      total: summaries.length,
      states: Array.from(new Set(allUniversities.map((row) => row.state))).sort(),
      types: Array.from(new Set(allUniversities.map((row) => row.type))) as UniversityType[],
      simulation: true,
    };
  }

  async findRaw(idOrSlug: string): Promise<UniversityWithPrograms> {
    const university = await this.prisma.university.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: UNIVERSITY_INCLUDE,
    });
    if (!university) throw new NotFoundException('University not found.');
    return university;
  }

  async detail(idOrSlug: string): Promise<UniversityDetail> {
    const university = await this.findRaw(idOrSlug);
    const top = university.programs
      .map((program) => ({
        program,
        cost: buildCost(program, university, program.costSchedules),
        outcome: buildOutcome(program, program.outcomes),
      }))
      .sort((a, b) => (b.outcome?.medianSalary ?? 0) - (a.outcome?.medianSalary ?? 0))[0];

    const slips = await this.prisma.feeSlip.findMany({
      where: { universityId: university.id },
      select: {
        total: true,
        academicYear: true,
        status: true,
        reviewedAt: true,
        programId: true,
      },
    });
    const verified = slips.filter((slip) => slip.status === 'VERIFIED');
    const pending = slips.filter(
      (slip) => slip.status === 'PENDING' || slip.status === 'UNDER_REVIEW',
    );
    const topSlips = verified.filter((slip) => slip.programId === top?.program.id);
    const averageTotal =
      topSlips.length > 0
        ? Math.round(topSlips.reduce((sum, slip) => sum + slip.total, 0) / topSlips.length)
        : verified.length > 0
          ? Math.round(verified.reduce((sum, slip) => sum + slip.total, 0) / verified.length)
          : null;
    const lastVerifiedAt = verified
      .map((slip) => slip.reviewedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const feeSlipPulse: FeeSlipPulse = {
      verifiedCount: verified.length,
      pendingCount: pending.length,
      averageTotal,
      variancePct: null,
      latestAcademicYear: topSlips[0]?.academicYear ?? verified[0]?.academicYear ?? null,
      lastVerifiedAt: lastVerifiedAt?.toISOString() ?? null,
    };

    const summary = summaryForUniversity(university);
    return {
      ...summary,
      description: university.description,
      website: university.website,
      address: `${university.city}, ${university.state}`,
      accreditation: university.accreditation,
      programs: university.programs.map((program) => programSummary(program, university)),
      feeSlipPulse,
      outcomeOverview: top?.outcome ?? null,
      simulation: true,
    };
  }

  async allInCost(universityId: string, programId: string): Promise<AllInCost> {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, universityId },
      include: { university: true, costSchedules: { orderBy: { academicYear: 'asc' } } },
    });
    if (!program) throw new NotFoundException('Programme not found for this university.');
    const slips = await this.prisma.feeSlip.findMany({
      where: { programId, status: 'VERIFIED' },
      select: { academicYear: true, total: true, reviewedAt: true },
    });
    return buildCost(program, program.university, program.costSchedules, slips);
  }

  async outcome(universityId: string, programId?: string): Promise<OutcomeOracle> {
    const programs = await this.prisma.program.findMany({
      where: { universityId },
      include: { outcomes: true },
    });
    if (programs.length === 0) throw new NotFoundException('No programmes found for this university.');
    const selected = programId
      ? programs.find((program) => program.id === programId)
      : programs
          .map((program) => ({ program, outcome: buildOutcome(program, program.outcomes) }))
          .sort((a, b) => (b.outcome?.medianSalary ?? 0) - (a.outcome?.medianSalary ?? 0))[0]
          ?.program;
    if (!selected) throw new NotFoundException('Programme not found for this university.');
    const outcome = buildOutcome(selected, selected.outcomes);
    if (!outcome) throw new NotFoundException('No verified outcome data exists for this programme yet.');
    return outcome;
  }

  async requireProgram(
    universityId: string,
    programId: string,
  ): Promise<{
    program: Program & { university: University; costSchedules: CostSchedule[]; outcomes: OutcomeData[] };
    cost: AllInCost;
    outcome: OutcomeOracle | null;
  }> {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, universityId },
      include: {
        university: true,
        costSchedules: { orderBy: { academicYear: 'asc' } },
        outcomes: true,
      },
    });
    if (!program) throw new NotFoundException('Programme not found for this university.');
    const slips = await this.prisma.feeSlip.findMany({
      where: { programId, status: 'VERIFIED' },
      select: { academicYear: true, total: true, reviewedAt: true },
    });
    return {
      program,
      cost: buildCost(program, program.university, program.costSchedules, slips),
      outcome: buildOutcome(program, program.outcomes),
    };
  }
}
