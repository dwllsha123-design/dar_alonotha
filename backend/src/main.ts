import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { assertProductionEnv, isProduction } from './common/production-env';

async function bootstrap() {
  assertProductionEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(join(uploadsDir, 'products'), { recursive: true });
  mkdirSync(join(uploadsDir, 'banners'), { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'r/:pageCode', method: RequestMethod.GET },
      { path: 'r/:pageCode/:agentCode', method: RequestMethod.GET },
      { path: '.well-known/apple-app-site-association', method: RequestMethod.GET },
      { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
  const envOrigins = (config.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origins = isProduction()
    ? envOrigins
    : [...new Set([...defaultOrigins, ...envOrigins])];

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Client-Platform',
      'X-App-Version',
      'X-Device-Id',
    ],
    exposedHeaders: ['X-Api-Version'],
  });

  if (!isProduction()) {
    const swagger = new DocumentBuilder()
      .setTitle('دار الأنوثة API')
      .setDescription(
        'Central Omnichannel Commerce API — Web, Admin, Android, and iOS',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 3000);
  // 0.0.0.0 for Docker/VPS; also accept IPv6 for Railway private networking
  await app.listen(port, '::');
  // eslint-disable-next-line no-console
  console.log(`API running on ${config.get('APP_URL') || `http://localhost:${port}`}/api/v1`);
  if (!isProduction()) {
    // eslint-disable-next-line no-console
    console.log(`Swagger docs: http://localhost:${port}/docs`);
  }
}

bootstrap();
