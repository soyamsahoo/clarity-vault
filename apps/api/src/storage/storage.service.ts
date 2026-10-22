import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { finished } from 'node:stream/promises';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly uploadsDir: string;

  constructor(config: ConfigService) {
    this.uploadsDir = path.resolve(
      config.get<string>('UPLOADS_DIR') ?? path.join(process.cwd(), 'uploads'),
    );
  }

  async onModuleInit(): Promise<void> {
    fs.mkdirSync(path.join(this.uploadsDir, 'fee-slips'), { recursive: true });
    fs.mkdirSync(path.join(this.uploadsDir, 'seed'), { recursive: true });
    await this.ensureSampleFeeSlip();
  }

  resolve(...parts: string[]): string {
    return path.join(this.uploadsDir, ...parts);
  }

  private async ensureSampleFeeSlip(): Promise<void> {
    const target = this.resolve('seed', 'sample-fee-slip.pdf');
    if (fs.existsSync(target)) return;
    try {
      await this.createSampleFeeSlip(target);
      this.logger.log('Created sample fee slip PDF used by seed data.');
    } catch (error) {
      this.logger.warn(`Could not create sample fee slip: ${(error as Error).message}`);
    }
  }

  private async createSampleFeeSlip(target: string): Promise<void> {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = fs.createWriteStream(target);
    document.pipe(stream);

    const ink = '#0B1F1C';
    const muted = '#667085';
    const green = '#0A6F4E';
    const brass = '#C48724';

    document.rect(0, 0, 595.28, 128).fill(ink);
    document
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text('INDIAN INSTITUTE OF TECHNOLOGY BOMBAY', 48, 44);
    document
      .fillColor('#D1FAE5')
      .font('Helvetica')
      .fontSize(10)
      .text('Fee Receipt · Academic Year 2026-27', 48, 76);
    document
      .fillColor(brass)
      .roundedRect(447, 34, 100, 22, 11)
      .fill();
    document
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('SIMULATED', 447, 41, { width: 100, align: 'center' });

    document.fillColor(ink).font('Helvetica-Bold').fontSize(11).text('STUDENT DETAILS', 48, 158);
    const details: Array<[string, string]> = [
      ['Student name', 'Ananya Sharma'],
      ['Roll number', '23B0301'],
      ['Programme', 'B.Tech Computer Science and Engineering'],
      ['Receipt number', 'RCPT-20262027-1000'],
    ];
    let y = 180;
    for (const [label, value] of details) {
      document.fillColor(muted).font('Helvetica').fontSize(9).text(label, 48, y);
      document.fillColor(ink).font('Helvetica-Bold').fontSize(10).text(value ?? '', 190, y);
      y += 20;
    }

    document.fillColor(ink).font('Helvetica-Bold').fontSize(11).text('FEE BREAKDOWN', 48, y + 18);
    y += 44;
    document.rect(48, y, 499, 24).fill('#EDE7D8');
    document.fillColor(ink).font('Helvetica-Bold').fontSize(9);
    document.text('COMPONENT', 60, y + 8);
    document.text('AMOUNT (INR)', 430, y + 8, { width: 100, align: 'right' });
    y += 24;

    const rows: Array<[string, string]> = [
      ['Tuition & academic fees', '2,25,000'],
      ['Hostel & accommodation', '58,000'],
      ['Mess charges', '52,000'],
      ['One-time admission & caution deposit', '28,000'],
      ['Other academic charges', '14,000'],
    ];
    document.font('Helvetica').fontSize(10);
    for (const [label, amount] of rows) {
      document
        .fillColor('#E4DED0')
        .moveTo(48, y)
        .lineTo(547, y)
        .stroke();
      document.fillColor(ink).text(label ?? '', 60, y + 10);
      document.text(amount ?? '', 430, y + 10, { width: 100, align: 'right' });
      y += 28;
    }
    document.rect(48, y, 499, 40).fill(green);
    document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text('TOTAL PAID', 60, y + 14);
    document.fontSize(15).text('INR 3,77,000', 380, y + 11, { width: 150, align: 'right' });

    document
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        'This is a synthetic receipt generated for the Clarity Vault prototype. It is not a valid institutional payment document.',
        48,
        y + 66,
        { width: 499 },
      );
    document.text(
      'Payment reference: SIM-UPI-2026-0731-4412 · Paid on 12 July 2026 · Verified by Clarity Vault (simulated)',
      48,
      y + 92,
      { width: 499 },
    );
    document
      .fillColor(brass)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('CLARITY VAULT · COST CERTAINTY, NOT GUESSWORK', 48, 790, { width: 499, align: 'center' });

    document.end();
    await finished(stream);
  }
}
