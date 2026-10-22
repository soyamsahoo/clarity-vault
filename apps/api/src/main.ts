import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);
  const port = Number(config.get('API_PORT') ?? 4000);
  const uploadsDir = path.resolve(config.get('UPLOADS_DIR') ?? path.join(process.cwd(), 'uploads'));

  fs.mkdirSync(uploadsDir, { recursive: true });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Clarity-Mode'],
  });
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  console.log(`Clarity Vault API listening on http://localhost:${port}/api`);
  console.log(`Simulation Mode: ${config.get('CLERK_SECRET_KEY') ? 'Clerk auth available' : 'demo auth'}`);
}

void bootstrap();
