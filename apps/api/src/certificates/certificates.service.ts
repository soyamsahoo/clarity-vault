import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type {
  CertificateSnapshot,
  CertificateSummary,
  CertificateVerification,
  CreateCertificateInput,
} from '@clarity/types';
import { formatInr } from '@clarity/utils';
import {
  Prisma,
  type Certificate,
  type Program,
  type University,
  type User,
} from '@clarity/database';
import { PrismaService } from '../prisma/prisma.module';
import { CatalogService } from '../catalog/catalog.service';
import { randomCode } from '../common/files';

const CERTIFICATE_INCLUDE = {
  user: { select: { fullName: true } },
  university: { select: { name: true } },
  program: { select: { name: true } },
} satisfies Prisma.CertificateInclude;

type CertificateWithRelations = Prisma.CertificateGetPayload<{
  include: typeof CERTIFICATE_INCLUDE;
}>;

function snapshotOf(certificate: Certificate): CertificateSnapshot {
  return certificate.snapshot as unknown as CertificateSnapshot;
}

@Injectable()
export class CertificatesService {
  private readonly publicWebUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    config: ConfigService,
  ) {
    this.publicWebUrl = (
      config.get<string>('PUBLIC_WEB_URL') ?? 'http://localhost:8081'
    ).replace(/\/$/, '');
  }

  private toSummary(certificate: CertificateWithRelations): CertificateSummary {
    const snapshot = snapshotOf(certificate);
    return {
      id: certificate.id,
      userId: certificate.userId,
      studentName: certificate.user.fullName,
      universityId: certificate.universityId,
      programId: certificate.programId,
      universityName: certificate.university.name,
      programName: certificate.program.name,
      verificationCode: certificate.verificationCode,
      issuedAt: certificate.issuedAt.toISOString(),
      expiresAt: certificate.expiresAt.toISOString(),
      status: certificate.status,
      grandTotal: certificate.grandTotal,
      confidenceScore: certificate.confidenceScore,
      downloadUrl: `/api/certificates/${certificate.id}/pdf`,
      verifyUrl: `${this.publicWebUrl}/certificate/${certificate.verificationCode}`,
      snapshot,
      simulation: true,
    };
  }

  async issue(user: User, input: CreateCertificateInput): Promise<CertificateSummary> {
    if (user.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException('Complete simulated KYC before issuing a cost certificate.');
    }
    const { program, cost, outcome } = await this.catalog.requireProgram(
      input.universityId,
      input.programId,
    );

    const snapshot: CertificateSnapshot = {
      universityName: program.university.name,
      programName: program.name,
      degree: program.degree,
      durationMonths: program.durationMonths,
      academicYears: cost.academicYears.map((year) => ({
        academicYear: year.academicYear,
        tuition: year.tuition,
        hostel: year.hostel,
        mess: year.mess,
        oneTime: year.oneTime,
        other: year.other,
        total: year.total,
      })),
      grandTotal: cost.grandTotal,
      tuitionTotal: cost.tuitionTotal,
      livingTotal: cost.livingTotal,
      confidenceScore: cost.confidence.score,
      confidenceLabel: cost.confidence.label,
      verifiedFeeSlipCount: cost.confidence.verifiedFeeSlipCount,
      verifiedScheduleCount: cost.confidence.verifiedScheduleCount,
      medianSalary: outcome?.medianSalary ?? null,
      placementRate: outcome?.employmentRate ?? null,
      financingEstimate: {
        annualRate: cost.financingEstimate.annualRate,
        tenureMonths: cost.financingEstimate.tenureMonths,
        monthlyEmi: cost.financingEstimate.monthlyEmi,
        totalInterest: cost.financingEstimate.totalInterest,
      },
    };

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    let created: CertificateWithRelations | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      try {
        created = await this.prisma.certificate.create({
          data: {
            userId: user.id,
            universityId: input.universityId,
            programId: input.programId,
            verificationCode: randomCode('CV', 6),
            grandTotal: cost.grandTotal,
            confidenceScore: cost.confidence.score,
            snapshot,
            expiresAt,
          },
          include: CERTIFICATE_INCLUDE,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }
    if (!created) throw new ForbiddenException('Could not generate a unique verification code.');
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CERTIFICATE_ISSUED',
        entity: 'Certificate',
        entityId: created.id,
        metadata: {
          verificationCode: created.verificationCode,
          grandTotal: created.grandTotal,
        },
      },
    });
    return this.toSummary(created);
  }

  async listMine(userId: string): Promise<CertificateSummary[]> {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      include: CERTIFICATE_INCLUDE,
      orderBy: { issuedAt: 'desc' },
    });
    return certificates.map((certificate) => this.toSummary(certificate));
  }

  async get(user: User, id: string): Promise<CertificateSummary> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: CERTIFICATE_INCLUDE,
    });
    if (!certificate) throw new NotFoundException('Certificate not found.');
    if (certificate.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('This certificate belongs to another student.');
    }
    return this.toSummary(certificate);
  }

  async verify(code: string): Promise<CertificateVerification> {
    const normalized = code.trim().toUpperCase();
    const certificate = await this.prisma.certificate.findUnique({
      where: { verificationCode: normalized },
      include: CERTIFICATE_INCLUDE,
    });
    if (!certificate) {
      return {
        valid: false,
        verificationCode: normalized,
        studentName: null,
        universityName: null,
        programName: null,
        grandTotal: null,
        issuedAt: null,
        expiresAt: null,
        status: null,
        message: 'No certificate matches this code.',
        simulation: true,
      };
    }
    const expired = certificate.expiresAt.getTime() < Date.now();
    const valid = certificate.status === 'ACTIVE' && !expired;
    return {
      valid,
      verificationCode: certificate.verificationCode,
      studentName: certificate.user.fullName,
      universityName: certificate.university.name,
      programName: certificate.program.name,
      grandTotal: certificate.grandTotal,
      issuedAt: certificate.issuedAt.toISOString(),
      expiresAt: certificate.expiresAt.toISOString(),
      status: certificate.status,
      message:
        certificate.status === 'REVOKED'
          ? 'This certificate has been revoked.'
          : expired
            ? 'This certificate has expired. Ask the student to issue a refreshed version.'
            : 'Certificate is active and matches Clarity Vault records.',
      simulation: true,
    };
  }

  async renderPdf(user: User, id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true, email: true } },
        university: true,
        program: true,
      },
    });
    if (!certificate) throw new NotFoundException('Certificate not found.');
    if (certificate.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('This certificate belongs to another student.');
    }
    const snapshot = snapshotOf(certificate);
    const buffer = await this.buildPdf(certificate, certificate.user, certificate.university, certificate.program, snapshot);
    await this.prisma.certificate.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    return {
      buffer,
      fileName: `Clarity-Vault-${certificate.verificationCode}.pdf`,
    };
  }

  private async buildPdf(
    certificate: Certificate,
    student: Pick<User, 'fullName' | 'email'>,
    university: University,
    program: Program,
    snapshot: CertificateSnapshot,
  ): Promise<Buffer> {
    const qr = await QRCode.toBuffer(`${this.publicWebUrl}/certificate/${certificate.verificationCode}`, {
      margin: 0,
      width: 112,
      color: { dark: '#0B1F1C', light: '#FFFFFF' },
    });

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const ink = '#0B1F1C';
    const green = '#0A6F4E';
    const brass = '#C48724';
    const muted = '#667085';
    const paper = '#FBF8F1';

    doc.rect(0, 0, 841.89, 595.28).fill(paper);
    doc.rect(28, 28, 785.89, 539.28).lineWidth(2).stroke(ink);
    doc.rect(36, 36, 769.89, 523.28).lineWidth(0.7).stroke(brass);

    doc.fillColor(green).font('Helvetica-Bold').fontSize(9).text('CLARITY VAULT', 60, 58, { characterSpacing: 2 });
    doc.fillColor(muted).font('Helvetica').fontSize(8).text('COST CLARITY CERTIFICATE · SIMULATED VERIFICATION', 60, 74);

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(30).text('Verified Cost of Study', 60, 104);
    doc
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(10)
      .text('A point-in-time, triangulated view of what this programme is likely to cost.', 60, 144);

    doc.roundedRect(600, 54, 176, 28, 14).fill('#FEF3C7');
    doc.fillColor(brass).font('Helvetica-Bold').fontSize(8).text('SIMULATED · NOT A LENDER DOCUMENT', 600, 64, {
      width: 176,
      align: 'center',
    });

    doc.fillColor(muted).font('Helvetica').fontSize(8).text('AWARDED TO', 60, 194);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text(student.fullName, 60, 208);
    doc.fillColor(muted).font('Helvetica').fontSize(8).text(student.email, 60, 235);

    doc.fillColor(muted).font('Helvetica').fontSize(8).text('PROGRAMME', 60, 270);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text(program.name, 60, 284, { width: 360 });
    doc.fillColor(muted).font('Helvetica').fontSize(8).text(university.name, 60, 308, { width: 360 });

    doc.fillColor(muted).font('Helvetica').fontSize(8).text('TOTAL COST OF STUDY', 430, 194);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(26).text(formatInr(snapshot.grandTotal), 430, 208);
    doc
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(8)
      .text(`${program.degree} · ${snapshot.durationMonths} months`, 430, 242);

    const cards = [
      ['COST CONFIDENCE', `${snapshot.confidenceScore}/100 · ${snapshot.confidenceLabel}`],
      ['VERIFIED FEE SLIPS', `${snapshot.verifiedFeeSlipCount}`],
      ['MEDIAN STARTING SALARY', snapshot.medianSalary ? formatInr(snapshot.medianSalary) : 'Not available'],
      ['EST. EMI', `${formatInr(snapshot.financingEstimate.monthlyEmi)}/mo`],
    ];
    cards.forEach(([label, value], index) => {
      const x = 60 + index * 134;
      doc.roundedRect(x, 352, 124, 64, 8).fill('#FFFFFF').stroke('#E4DED0');
      doc.fillColor(muted).font('Helvetica').fontSize(6.5).text(label ?? '', x + 10, 362, { width: 104 });
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(value ?? '', x + 10, 378, { width: 104 });
    });

    doc.fillColor(muted).font('Helvetica').fontSize(8).text('ACADEMIC YEAR BREAKDOWN', 60, 440);
    let x = 60;
    snapshot.academicYears.forEach((year) => {
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(8).text(year.academicYear, x, 458);
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(formatInr(year.total), x, 472);
      x += Math.min(120, 420 / Math.max(1, snapshot.academicYears.length));
    });

    doc.image(qr, 636, 352, { width: 112, height: 112 });
    doc.fillColor(muted).font('Helvetica').fontSize(6.5).text('Scan to verify', 636, 468, { width: 112, align: 'center' });

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(8).text('VERIFICATION', 60, 508);
    doc.fillColor(muted).font('Helvetica').fontSize(7).text(`Code ${certificate.verificationCode}`, 60, 520);
    doc.text(`Issued ${certificate.issuedAt.toLocaleDateString('en-IN')} · Valid until ${certificate.expiresAt.toLocaleDateString('en-IN')}`, 60, 532);

    doc.fillColor(green).font('Helvetica-Bold').fontSize(8).text('CLARITY VAULT', 700, 520, { width: 70, align: 'right' });
    doc.fillColor(muted).font('Helvetica').fontSize(6).text('Cost certainty,\nnot guesswork.', 700, 532, { width: 70, align: 'right' });

    doc
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(5.8)
      .text(
        'This certificate reflects synthetic cost, fee-slip and outcome data used by the Clarity Vault prototype. It is not a credit sanction, admission confirmation or financial advice. Verify status at the URL encoded in the QR code.',
        60,
        560,
        { width: 710 },
      );

    doc.end();
    return done;
  }
}
