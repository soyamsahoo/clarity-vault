import { PrismaClient } from '@prisma/client';
import {
  ApprovalStatus,
  CostSourceType,
  EmploymentType,
  FeeSlipFileType,
  KycStatus,
  OutcomeSourceType,
  UniversityType,
  VerificationStatus,
} from '@prisma/client';
import {
  buildRiskInput,
  computeCostCertainty,
  evaluatePolicies,
  findBestOffer,
  runRiskEngine,
  summariseOffers,
  triangulateOutcomes,
  type OutcomeRowInput,
  type BankPolicyMatrix,
} from '@clarity/utils';
import {
  adminSeed,
  bankSeeds,
  communityUsers,
  feeSlipSeeds,
  primaryStudentSeed,
  universitySeeds,
  type CommunityUserSeed,
  type UniversitySeed,
} from './seed-data';

const prisma = new PrismaClient();

const START_YEAR = 2026;
const ACADEMIC_YEAR = '2026-27';

const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);
const daysAhead = (days: number): Date => new Date(Date.now() + days * 86_400_000);

function academicYearFor(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function tuitionMultiplier(program: { tuitionMultiplier?: number }): number {
  return program.tuitionMultiplier ?? 1;
}

async function resetData(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.riskRun.deleteMany();
  await prisma.loanPreApproval.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.feeSlip.deleteMany();
  await prisma.financialProfile.deleteMany();
  await prisma.aAConsent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.outcomeData.deleteMany();
  await prisma.costSchedule.deleteMany();
  await prisma.program.deleteMany();
  await prisma.university.deleteMany();
  await prisma.bankPolicy.deleteMany();
  await prisma.bank.deleteMany();
}

async function main(): Promise<void> {
  console.log('Resetting Clarity Vault sample data…');
  await resetData();

  const banks = new Map<string, { id: string; name: string; code: string }>();
  for (const seed of bankSeeds) {
    const bank = await prisma.bank.create({
      data: {
        name: seed.name,
        code: seed.code,
        logoInitials: seed.logoInitials,
        accentColor: seed.accentColor,
        website: seed.website,
        policies: {
          create: {
            productName: seed.policy.productName,
            minCreditScore: seed.policy.minCreditScore,
            maxFoir: seed.policy.maxFoir,
            minMonthlyIncome: seed.policy.minMonthlyIncome,
            maxLoanAmount: seed.policy.maxLoanAmount,
            minTenureMonths: seed.policy.minTenureMonths,
            maxTenureMonths: seed.policy.maxTenureMonths,
            baseRate: seed.policy.baseRate,
            maxRate: seed.policy.maxRate,
            requiresCoApplicant: seed.policy.requiresCoApplicant,
            allowedEmploymentTypes: seed.policy.allowedEmploymentTypes,
            maxLtv: seed.policy.maxLtv,
            processingFeePct: seed.policy.processingFeePct,
            collateralRequiredAbove: seed.policy.collateralRequiredAbove,
            active: seed.policy.active,
            notes: seed.policy.notes,
          },
        },
      },
    });
    banks.set(seed.code, { id: bank.id, name: bank.name, code: bank.code });
  }
  console.log(`Seeded ${banks.size} lenders and policy matrices.`);

  const universities = new Map<
    string,
    { id: string; name: string; shortName: string; seed: UniversitySeed }
  >();
  const programs = new Map<
    string,
    { id: string; name: string; degree: string; durationMonths: number; universityId: string }
  >();
  const programKey = (slug: string, name: string): string => `${slug}|${name}`;

  for (const seed of universitySeeds) {
    const university = await prisma.university.create({
      data: {
        slug: seed.slug,
        name: seed.name,
        shortName: seed.shortName,
        type: seed.type as UniversityType,
        city: seed.city,
        state: seed.state,
        nirfRank: seed.nirfRank,
        established: seed.established,
        website: seed.website,
        description: seed.description,
        accreditation: seed.accreditation,
        logoInitials: seed.logoInitials,
        accentColor: seed.accentColor,
        verified: seed.verified,
      },
    });
    universities.set(seed.slug, {
      id: university.id,
      name: university.name,
      shortName: university.shortName,
      seed,
    });

    for (const programSeed of seed.programs) {
      const program = await prisma.program.create({
        data: {
          universityId: university.id,
          name: programSeed.name,
          degree: programSeed.degree,
          discipline: programSeed.discipline,
          durationMonths: programSeed.durationMonths,
          seats: programSeed.seats,
          stem: true,
        },
      });
      programs.set(programKey(seed.slug, programSeed.name), {
        id: program.id,
        name: program.name,
        degree: program.degree,
        durationMonths: program.durationMonths,
        universityId: university.id,
      });

      const years = Math.ceil(programSeed.durationMonths / 12);
      const multiplier = tuitionMultiplier(programSeed);
      const scheduleRows = [];
      for (let index = 0; index < years; index += 1) {
        const factor = Math.pow(1 + seed.cost.escalationPct / 100, index);
        const startYear = START_YEAR + index;
        scheduleRows.push({
          programId: program.id,
          academicYear: academicYearFor(startYear),
          tuition: Math.round(seed.cost.tuition * multiplier * factor),
          hostel: Math.round(seed.cost.hostel * factor),
          mess: Math.round(seed.cost.mess * factor),
          oneTime: index === 0 ? seed.cost.oneTime : 0,
          other: Math.round(seed.cost.other * multiplier * factor),
          sourceLabel: `Official Fee Circular ${academicYearFor(startYear)} (simulated)`,
          sourceType: CostSourceType.OFFICIAL,
          verified: seed.verified,
          effectiveFrom: new Date(`${startYear}-07-01T00:00:00.000Z`),
        });
      }
      await prisma.costSchedule.createMany({ data: scheduleRows });

      const sources: Array<{
        type: OutcomeSourceType;
        label: string;
        sampleSize: number;
        factor: number;
        placementDelta: number;
        confidence: number;
        notes: string;
      }> = [
        {
          type: OutcomeSourceType.OFFICIAL,
          label: 'Official placement report 2025',
          sampleSize: Math.max(180, Math.round(programSeed.seats * 8)),
          factor: 1,
          placementDelta: 0,
          confidence: 0.9,
          notes: 'Published by the institute placement cell. Salary figures self-reported by recruiters.',
        },
        {
          type: OutcomeSourceType.GOVT_SURVEY,
          label: 'NIRF graduate outcomes 2025',
          sampleSize: 1400,
          factor: 0.89,
          placementDelta: -0.02,
          confidence: 0.84,
          notes: 'Aggregated NIRF outcome data; programme-level cut is modelled.',
        },
        {
          type: OutcomeSourceType.ALUMNI_SURVEY,
          label: 'Verified alumni survey 2025',
          sampleSize: Math.round(programSeed.seats * 2.4),
          factor: 0.92,
          placementDelta: -0.05,
          confidence: 0.78,
          notes: 'Clarity Vault alumni panel; KYC-verified respondents, 14-month post-graduation window.',
        },
        {
          type: OutcomeSourceType.CROWDSOURCED,
          label: 'Crowdsourced student reports',
          sampleSize: Math.round(programSeed.seats * 0.9),
          factor: seed.type === 'PRIVATE' || seed.type === 'DEEMED' ? 0.79 : 0.84,
          placementDelta: -0.1,
          confidence: 0.66,
          notes: 'Anonymous but identity-verified student submissions; lower-bound view.',
        },
      ];

      await prisma.outcomeData.createMany({
        data: sources.map((source) => ({
          universityId: university.id,
          programId: program.id,
          year: 2025,
          sourceType: source.type,
          sourceLabel: source.label,
          sampleSize: source.sampleSize,
          placementRate: Math.max(0.5, programSeed.placementRate + source.placementDelta),
          medianSalary: Math.round(programSeed.salary.median * source.factor),
          p25Salary: Math.round(programSeed.salary.p25 * source.factor),
          p75Salary: Math.round(programSeed.salary.p75 * source.factor),
          topRecruiters: seed.recruiters,
          aiExposureIndex: programSeed.aiExposure,
          confidence: source.confidence,
          notes: source.notes,
        })),
      });
    }
  }
  console.log(
    `Seeded ${universities.size} universities, ${programs.size} programmes, cost schedules and triangulated outcomes.`,
  );

  const admin = await prisma.user.create({
    data: {
      clerkId: adminSeed.clerkId,
      email: adminSeed.email,
      fullName: adminSeed.fullName,
      phone: adminSeed.phone,
      role: 'ADMIN',
      kycStatus: KycStatus.VERIFIED,
      kycVerifiedAt: daysAgo(120),
      onboardingCompleted: true,
    },
  });

  const createStudent = async (seed: CommunityUserSeed) => {
    const university = universities.get(seed.targetUniversitySlug);
    const program = programs.get(programKey(seed.targetUniversitySlug, seed.targetProgramName));
    if (!university || !program) {
      throw new Error(`Target programme not found for ${seed.email}`);
    }
    return prisma.user.create({
      data: {
        clerkId: seed.clerkId,
        email: seed.email,
        fullName: seed.fullName,
        phone: seed.phone,
        role: 'STUDENT',
        kycStatus: seed.kycStatus as KycStatus,
        kycPanLast4: seed.kycStatus === 'VERIFIED' ? '7K3M' : null,
        kycAadhaarLast4: seed.kycStatus === 'VERIFIED' ? '4412' : null,
        kycVerifiedAt: seed.kycStatus === 'VERIFIED' ? daysAgo(40) : null,
        onboardingCompleted: seed.onboardingCompleted,
        targetUniversityId: university.id,
        targetProgramId: program.id,
        targetLoanAmount: seed.targetLoanAmount,
        familyIncomeAnnual: seed.familyIncomeAnnual,
      },
    });
  };

  const primary = await createStudent(primaryStudentSeed);
  const crowdUsers = new Map<string, string>();
  for (const seed of communityUsers) {
    const user = await createStudent(seed);
    crowdUsers.set(seed.email, user.id);
  }
  console.log(`Seeded demo student and ${crowdUsers.size} community contributors.`);

  const allSchedules = await prisma.costSchedule.findMany({
    where: { programId: programs.get(programKey('iit-bombay', 'B.Tech Computer Science and Engineering'))?.id },
  });
  const scheduleByYear = new Map(allSchedules.map((row) => [row.academicYear, row]));

  async function createFeeSlip(
    seed: (typeof feeSlipSeeds)[number],
    index: number,
  ): Promise<void> {
    const university = universities.get(seed.universitySlug);
    const program = programs.get(programKey(seed.universitySlug, seed.programName));
    if (!university || !program) return;
    const submitter =
      seed.submitterEmail === primaryStudentSeed.email
        ? primary
        : crowdUsers.get(seed.submitterEmail)
          ? { id: crowdUsers.get(seed.submitterEmail)! }
          : null;
    if (!submitter) return;

    let schedule = scheduleByYear.get(seed.academicYear);
    if (!schedule && seed.universitySlug === 'iit-bombay' && seed.programName.includes('Computer')) {
      const current = allSchedules.find((row) => row.academicYear === ACADEMIC_YEAR);
      if (current) {
        schedule = { ...current, oneTime: 0 };
      }
    }
    if (!schedule) {
      const rows = await prisma.costSchedule.findMany({
        where: { programId: program.id },
        orderBy: { academicYear: 'asc' },
        take: 1,
      });
      schedule = rows[0] ?? null;
    }
    if (!schedule) return;

    const variance = seed.variance ?? 0;
    const tuition = Math.round(schedule.tuition * (1 + variance));
    const hostel = Math.round(schedule.hostel * (1 + variance));
    const mess = Math.round(schedule.mess * (1 + variance));
    const oneTime = seed.academicYear === ACADEMIC_YEAR ? schedule.oneTime : 0;
    const other = Math.round(schedule.other * (1 + variance));
    const total = tuition + hostel + mess + oneTime + other;
    const verifiedAt =
      seed.status === 'VERIFIED' || seed.status === 'REJECTED' ? daysAgo(28 - (index % 20)) : null;

    await prisma.feeSlip.create({
      data: {
        userId: submitter.id,
        universityId: university.id,
        programId: program.id,
        academicYear: seed.academicYear,
        tuition,
        hostel,
        mess,
        oneTime,
        other,
        total,
        filePath: 'seed/sample-fee-slip.pdf',
        fileName: `fee-receipt-${seed.academicYear}.pdf`,
        fileType: FeeSlipFileType.PDF,
        mimeType: 'application/pdf',
        receiptNumber: `RCPT-${seed.academicYear.replace('-', '')}-${1000 + index}`,
        notes: seed.notes ?? null,
        status: seed.status as VerificationStatus,
        kycStatus: 'VERIFIED',
        verificationNotes: seed.verificationNotes ?? null,
        reviewedById: seed.status === 'PENDING' ? null : admin.id,
        reviewedAt: verifiedAt,
        createdAt: daysAgo(40 - (index % 20)),
      },
    });
  }

  for (const [index, seed] of feeSlipSeeds.entries()) {
    await createFeeSlip(seed, index);
  }
  console.log(`Seeded ${feeSlipSeeds.length} community fee slips.`);

  const targetProgram = programs.get(
    programKey('iit-bombay', 'B.Tech Computer Science and Engineering'),
  );
  const targetUniversity = universities.get('iit-bombay');
  if (!targetProgram || !targetUniversity) throw new Error('Demo target missing');

  const targetSchedules = await prisma.costSchedule.findMany({
    where: { programId: targetProgram.id },
    orderBy: { academicYear: 'asc' },
  });
  const targetSlips = await prisma.feeSlip.findMany({
    where: {
      programId: targetProgram.id,
      status: VerificationStatus.VERIFIED,
    },
  });
  const targetOutcomes = await prisma.outcomeData.findMany({
    where: { programId: targetProgram.id },
  });
  const outcomeRows: OutcomeRowInput[] = targetOutcomes.map((row) => ({
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
  const outcomeAggregate = triangulateOutcomes(outcomeRows);

  const cost = computeCostCertainty({
    durationMonths: targetProgram.durationMonths,
    schedules: targetSchedules.map((row) => ({
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
    })),
    feeSlips: targetSlips.map((slip) => ({
      academicYear: slip.academicYear,
      total: slip.total,
      verifiedAt: slip.reviewedAt,
    })),
    annualEscalationPct: 5,
  });

  const certificate = await prisma.certificate.create({
    data: {
      userId: primary.id,
      universityId: targetUniversity.id,
      programId: targetProgram.id,
      verificationCode: 'CV-7K3M9Q',
      status: 'ACTIVE',
      grandTotal: cost.grandTotal,
      confidenceScore: cost.confidence.score,
      issuedAt: daysAgo(9),
      expiresAt: daysAhead(356),
      snapshot: {
        universityName: targetUniversity.name,
        programName: targetProgram.name,
        degree: targetProgram.degree,
        durationMonths: targetProgram.durationMonths,
        academicYears: cost.academicYears.map(({ label: _label, ...year }) => year),
        grandTotal: cost.grandTotal,
        tuitionTotal: cost.tuitionTotal,
        livingTotal: cost.livingTotal,
        confidenceScore: cost.confidence.score,
        confidenceLabel: cost.confidence.label,
        verifiedFeeSlipCount: cost.confidence.verifiedFeeSlipCount,
        verifiedScheduleCount: cost.confidence.verifiedScheduleCount,
        medianSalary: outcomeAggregate.medianSalary,
        placementRate: outcomeAggregate.employmentRate,
        financingEstimate: {
          annualRate: cost.financingEstimate.annualRate,
          tenureMonths: cost.financingEstimate.tenureMonths,
          monthlyEmi: cost.financingEstimate.monthlyEmi,
          totalInterest: cost.financingEstimate.totalInterest,
        },
      },
    },
  });
  console.log(`Issued demo Cost Certainty Certificate ${certificate.verificationCode}.`);

  const months = ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'];
  const salarySeries = [145_000, 145_000, 148_500, 145_000, 151_000, 145_000];
  const spendSeries = [58_000, 61_000, 54_000, 63_000, 57_000, 59_000];
  const consent = await prisma.aAConsent.create({
    data: {
      userId: primary.id,
      consentHandle: 'AA-SIM-2026-9F4C2A',
      status: 'ACTIVE',
      purpose: 'EDUCATION_LOAN_UNDERWRITING',
      durationMonths: 3,
      dataRangeMonths: 6,
      fiTypes: ['SALARY_ACCOUNT', 'BANK_SAVINGS'],
      accounts: [
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
      ],
      approvedAt: daysAgo(12),
      expiresAt: daysAhead(78),
      lastFetchedAt: daysAgo(1),
    },
  });

  await prisma.financialProfile.create({
    data: {
      userId: primary.id,
      consentId: consent.id,
      monthlyIncome: 145_000,
      monthlyExpenses: 58_000,
      existingEmi: 8_500,
      creditScore: 782,
      employmentType: EmploymentType.SALARIED_PRIVATE,
      employer: 'Infosys Ltd · co-applicant (father)',
      bankName: 'HDFC Bank',
      accountMasked: '•••• 4412',
      averageBalance: 268_500,
      salaryCredits: 6,
      dataQuality: 0.92,
      incomeSources: [
        { label: 'Salary credit — co-applicant', monthlyAmount: 145_000, months: 6 },
        { label: 'Interest income', monthlyAmount: 1_200, months: 6 },
      ],
      monthlySeries: months.map((month, index) => ({
        month,
        salary: salarySeries[index] ?? 145_000,
        spend: spendSeries[index] ?? 58_000,
      })),
      flags: ['SALARY_CREDITS_CONSISTENT', 'NO_EMI_BOUNCE', 'AVERAGE_BALANCE_HEALTHY'],
      verifiedAt: daysAgo(12),
    },
  });
  console.log('Seeded simulated Account Aggregator consent and financial profile.');

  const policies = await prisma.bankPolicy.findMany({
    include: { bank: true },
    where: { active: true },
  });
  const policyMatrix: BankPolicyMatrix[] = policies.map((policy) => ({
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

  const offers = evaluatePolicies(
    {
      creditScore: 782,
      monthlyIncome: 145_000,
      monthlyExpenses: 58_000,
      existingEmi: 8_500,
      employmentType: 'SALARIED_PRIVATE',
      employmentStabilityMonths: 84,
      coApplicant: true,
      collateralValue: null,
      dataQuality: 0.92,
    },
    policyMatrix,
    {
      requestedAmount: primaryStudentSeed.targetLoanAmount,
      costOfStudy: cost.grandTotal,
      courseDurationMonths: targetProgram.durationMonths,
      moratoriumMonths: targetProgram.durationMonths + 6,
    },
  );
  const bestOffer = findBestOffer(offers);
  const runId = 'run_demo_ananya';
  for (const offer of offers) {
    await prisma.loanPreApproval.create({
      data: {
        userId: primary.id,
        bankPolicyId: offer.policyId,
        runId,
        universityId: targetUniversity.id,
        programId: targetProgram.id,
        requestedAmount: primaryStudentSeed.targetLoanAmount,
        approvedAmount: offer.approvedAmount,
        interestRate: offer.interestRate,
        tenureMonths: offer.tenureMonths,
        emi: offer.emi,
        totalInterest: offer.totalInterest,
        processingFee: offer.processingFee,
        confidence: offer.confidence,
        reasons: offer.reasons,
        conditions: offer.conditions,
        foir: offer.foir,
        collateralRequired: offer.collateralRequired,
        coApplicantRequired: offer.coApplicantRequired,
        status: offer.status as ApprovalStatus,
        notes: offer.notes,
        expiresAt: daysAhead(30),
        createdAt: daysAgo(5),
      },
    });
  }
  console.log(
    `Matched ${offers.length} lender offers. ${bestOffer ? `Best: ${bestOffer.bankName}.` : 'No clean match.'} ${summariseOffers(offers, primaryStudentSeed.targetLoanAmount)}`,
  );

  const riskInput = buildRiskInput({
    principal: primaryStudentSeed.targetLoanAmount,
    courseDurationMonths: targetProgram.durationMonths,
    medianAnnualSalary: outcomeAggregate.medianSalary,
    placementRate: outcomeAggregate.employmentRate,
    annualRate: 10.5,
    tenureMonths: 120,
    iterations: 6000,
    seed: 20261022,
  });
  const riskOutput = runRiskEngine(riskInput);
  const riskId = 'risk_demo_ananya';
  const generatedAt = daysAgo(4).toISOString();
  const riskResult = {
    id: riskId,
    generatedAt,
    universityId: targetUniversity.id,
    universityName: targetUniversity.name,
    programId: targetProgram.id,
    programName: targetProgram.name,
    ...riskOutput,
    simulation: true,
    disclaimer:
      'Simulation Mode: this Monte-Carlo report is illustrative, not a credit guarantee or investment advice.',
  };
  await prisma.riskRun.create({
    data: {
      id: riskId,
      userId: primary.id,
      universityId: targetUniversity.id,
      programId: targetProgram.id,
      seed: riskInput.seed,
      inputs: riskInput as unknown as object,
      results: riskResult as unknown as object,
      createdAt: daysAgo(4),
    },
  });
  console.log(
    `Seeded Monte-Carlo run: ${Math.round(riskOutput.metrics.probabilityOfDistress * 100)}% distress probability, ${riskOutput.metrics.riskBand}.`,
  );

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: 'FEE_SLIP_VERIFIED',
        entity: 'FeeSlip',
        entityId: targetSlips[0]?.id ?? null,
        metadata: { note: 'Demo seed verification' },
        createdAt: daysAgo(7),
      },
      {
        actorId: admin.id,
        action: 'BANK_POLICY_UPDATED',
        entity: 'BankPolicy',
        entityId: policies[0]?.id ?? null,
        metadata: { field: 'baseRate', note: 'Seeded policy matrix refresh' },
        createdAt: daysAgo(11),
      },
      {
        actorId: primary.id,
        action: 'CONSENT_APPROVED',
        entity: 'AAConsent',
        entityId: consent.id,
        metadata: { durationMonths: 3, fiTypes: ['SALARY_ACCOUNT', 'BANK_SAVINGS'] },
        createdAt: daysAgo(12),
      },
    ],
  });

  console.log('\nClarity Vault seed complete.');
  console.log(`  Demo student: ${primaryStudentSeed.email} (token demo:student)`);
  console.log(`  Demo admin:   ${adminSeed.email} (token demo:admin)`);
  console.log(`  All-in cost:  ₹${cost.grandTotal.toLocaleString('en-IN')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
