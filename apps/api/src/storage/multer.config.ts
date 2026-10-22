import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModuleAsyncOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const multerOptions: MulterModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        const root = path.resolve(
          config.get<string>('UPLOADS_DIR') ?? path.join(process.cwd(), 'uploads'),
        );
        const destination = path.join(root, 'fee-slips');
        fs.mkdirSync(destination, { recursive: true });
        callback(null, destination);
      },
      filename: (_request, file, callback) => {
        const extension =
          EXTENSION_BY_MIME[file.mimetype] ?? path.extname(file.originalname).toLowerCase() ?? '.bin';
        callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
      },
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        callback(
          new BadRequestException('Upload a PDF, JPG, PNG or WebP fee receipt (max 10 MB).'),
          false,
        );
        return;
      }
      callback(null, true);
    },
  }),
};

export const uploadPathFor = (filename: string): string => `fee-slips/${filename}`;
