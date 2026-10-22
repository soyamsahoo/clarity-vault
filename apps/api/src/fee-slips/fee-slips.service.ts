import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type {
  CreateFeeSlipInput,
  FeeSlipStats,
  FeeSlipSummary,
  ReviewFeeSlipInput,
} from '@clarity/types';
import { Prisma, type FeeSlip, type User } from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.service';
import { safeUnlink } from '../common/files';

const FEE_SLIP_INCLUDE = {
  university: true,
  program: true,
  user: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
} satisfies Prisma.FeeSlipInclude;

type FeeSlipWithRelations = Prisma.FeeSlipGetPayload<{ include: typeof FEE_SLIP_INCLUDE }>;

function toFeeSlipSummary(slip: FeeSlipWithRelations): FeeSlipSummary {
  return {
    id: slip.id,
    userId: slip.userId,
    submitterName: slip.user.fullName,
    universityId: slip.universityId,
    universityName: slip.university.name,
    universityShortName: slip.university.shortName,
    programId: slip.programId,
    programName: slip.program?.name ?? null,
    academicYear: slip.academicYear,
    tuition: slip.tuition,
    hostel: slip.hostel,
    mess: slip.mess,
    oneTime: slip.oneTime,
    other: slip.other,
    total: slip.total,
    fileUrl: `/uploads/${slip.filePath}`,
    fileName: slip.fileName,
    fileType: slip.fileType,
    status: slip.status,
    kycStatus: slip.kycStatus,
    receiptNumber: slip.receiptNumber,
    notes: slip.notes,
    verificationNotes: slip.verificationNotes,
    submittedAt: slip.createdAt.toISOString(),
    reviewedAt: slip.reviewedAt?.toISOString() ?? null,
    reviewedBy: slip.reviewedBy?.fullName ?? null,
    simulation: true,
  };
}

@Injectable()
export class FeeSlipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    user: User,
    file: Express.Multer.File | undefined,
    input: CreateFeeSlipInput,
  ): Promise<FeeSlipSummary> {
    const absolutePath = file?.path;
    try {
      if (!file) throw new BadRequestException('Attach a fee receipt PDF or image.');
      if (user.kycStatus !== 'VERIFIED') {
        throw new ForbiddenException('Complete simulated KYC before uploading a fee receipt.');
      }
      const university = await this.prisma.university.findUnique({
        where: { id: input.universityId },
      });
      if (!university) throw new NotFoundException('University not found.');
      if (input.programId) {
        const program = await this.prisma.program.findFirst({
          where: { id: input.programId, universityId: input.universityId },
        });
        if (!program) throw new NotFoundException('Programme not found for this university.');
      }

      const total = input.tuition + input.hostel + input.mess + input.oneTime + input.other;
      if (total <= 0) throw new BadRequestException('Fee amounts must add up to more than zero.');

      const filePath = `fee-slips/${file.filename}`;
      const slip = await this.prisma.feeSlip.create({
        data: {
          userId: user.id,
          universityId: input.universityId,
          programId: input.programId,
          academicYear: input.academicYear,
          tuition: input.tuition,
          hostel: input.hostel,
          mess: input.mess,
          oneTime: input.oneTime,
          other: input.other,
          total,
          filePath,
          fileName: file.originalname,
          fileType: file.mimetype === 'application/pdf' ? 'PDF' : 'IMAGE',
          mimeType: file.mimetype,
          receiptNumber: input.receiptNumber,
          notes: input.notes,
          status: 'PENDING',
          kycStatus: user.kycStatus,
        },
        include: FEE_SLIP_INCLUDE,
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'FEE_SLIP_SUBMITTED',
          entity: 'FeeSlip',
          entityId: slip.id,
          metadata: { total, academicYear: slip.academicYear },
        },
      });
      return toFeeSlipSummary(slip);
    } catch (error) {
      await safeUnlink(absolutePath);
      throw error;
    }
  }

  async listMine(userId: string): Promise<FeeSlipSummary[]> {
    const slips = await this.prisma.feeSlip.findMany({
      where: { userId },
      include: FEE_SLIP_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return slips.map(toFeeSlipSummary);
  }

  async get(user: User, id: string): Promise<FeeSlipSummary> {
    const slip = await this.prisma.feeSlip.findUnique({
      where: { id },
      include: FEE_SLIP_INCLUDE,
    });
    if (!slip) throw new NotFoundException('Fee slip not found.');
    if (slip.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only view your own fee slips.');
    }
    return toFeeSlipSummary(slip);
  }

  async review(
    actor: User,
    id: string,
    input: ReviewFeeSlipInput,
    options: { allowOwner: boolean },
  ): Promise<FeeSlipSummary> {
    const slip = await this.prisma.feeSlip.findUnique({
      where: { id },
      include: { user: { select: { fullName: true, kycStatus: true } } },
    });
    if (!slip) throw new NotFoundException('Fee slip not found.');
    if (!options.allowOwner && actor.role !== 'ADMIN' && slip.userId !== actor.id) {
      throw new ForbiddenException('Only an administrator can review this slip.');
    }
    if (options.allowOwner && actor.role !== 'ADMIN' && slip.userId !== actor.id) {
      throw new ForbiddenException('You can only simulate review for your own slip.');
    }
    if (input.action === 'VERIFY' && slip.user.kycStatus !== 'VERIFIED') {
      throw new BadRequestException('The submitter has not completed KYC.');
    }

    const status =
      input.action === 'VERIFY'
        ? 'VERIFIED'
        : input.action === 'REJECT'
          ? 'REJECTED'
          : 'UNDER_REVIEW';

    const updated = await this.prisma.feeSlip.update({
      where: { id },
      data: {
        status,
        verificationNotes:
          input.notes ??
          (options.allowOwner && actor.role !== 'ADMIN'
            ? 'Simulated verification triggered from the student app.'
            : slip.verificationNotes),
        reviewedById: status === 'UNDER_REVIEW' ? slip.reviewedById : actor.id,
        reviewedAt: status === 'UNDER_REVIEW' ? slip.reviewedAt : new Date(),
      },
      include: FEE_SLIP_INCLUDE,
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action:
          status === 'VERIFIED'
            ? 'FEE_SLIP_VERIFIED'
            : status === 'REJECTED'
              ? 'FEE_SLIP_REJECTED'
              : 'FEE_SLIP_UNDER_REVIEW',
        entity: 'FeeSlip',
        entityId: id,
        metadata: {
          simulated: options.allowOwner && actor.role !== 'ADMIN',
          notes: input.notes ?? null,
        },
      },
    });
    return toFeeSlipSummary(updated);
  }

  async adminList(options: {
    status?: string;
    universityId?: string;
    limit?: number;
  }): Promise<FeeSlipSummary[]> {
    const statuses = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'] as const;
    const status = statuses.find((value) => value === options.status);
    const slips = await this.prisma.feeSlip.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(options.universityId ? { universityId: options.universityId } : {}),
      },
      include: FEE_SLIP_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: Math.min(options.limit ?? 50, 100),
    });
    return slips.map(toFeeSlipSummary);
  }

  async stats(userId: string): Promise<FeeSlipStats> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [total, pending, verified, rejected, mine, verifiedThisMonth] = await Promise.all([
      this.prisma.feeSlip.count(),
      this.prisma.feeSlip.count({ where: { status: 'PENDING' } }),
      this.prisma.feeSlip.count({ where: { status: 'VERIFIED' } }),
      this.prisma.feeSlip.count({ where: { status: 'REJECTED' } }),
      this.prisma.feeSlip.count({ where: { userId } }),
      this.prisma.feeSlip.count({
        where: { status: 'VERIFIED', reviewedAt: { gte: startOfMonth } },
      }),
    ]);
    return { total, pending, verified, rejected, mine, verifiedThisMonth };
  }

  async countVerifiedForProgram(programId: string): Promise<number> {
    return this.prisma.feeSlip.count({ where: { programId, status: 'VERIFIED' } });
  }
}

export type { FeeSlipWithRelations };
export { toFeeSlipSummary };
