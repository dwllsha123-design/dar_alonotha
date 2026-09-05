import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
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
      hsts: isProduction()
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false,
    }),
  );

  // Behind Railway/Nginx: upgrade plain HTTP when the edge marks the request as http
  if (isProduction()) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const proto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      const host = String(req.headers.host || '')
        .split(':')[0]
        .toLowerCase();
      if (proto === 'http') {
        const targetHost = host.startsWith('www.') ? host.slice(4) : host || 'daralonotha.com';
        return res.redirect(301, `https://${targetHost}${req.originalUrl}`);
      }
      if (host === 'www.daralonotha.com') {
        return res.redirect(301, `https://daralonotha.com${req.originalUrl}`);
      }
      return next();
    });
  }

  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(join(uploadsDir, 'products'), { recursive: true });
  mkdirSync(join(uploadsDir, 'banners'), { recursive: true });
  mkdirSync(join(uploadsDir, 'categories'), { recursive: true });
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

  const port = Number(config.get('PORT') ?? process.env.PORT ?? 3000);
  // Bind dual-stack when possible:
  // - 0.0.0.0 → public Railway / Docker IPv4 health checks
  // - :: → Railway private networking (*.railway.internal is IPv6)
  // Listening only on "::" with ipv6only can reject IPv4; prefer host omitted (Node dual-stack).
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on 0.0.0.0/:: port ${port} → ${config.get('APP_URL') || `http://localhost:${port}`}/api/v1`);
  if (!isProduction()) {
    // eslint-disable-next-line no-console
    console.log(`Swagger docs: http://localhost:${port}/docs`);
  }
}

bootstrap();
