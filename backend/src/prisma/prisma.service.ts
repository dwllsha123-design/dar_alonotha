import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { isProduction } from '../common/production-env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    const url = (process.env.DATABASE_URL || '').trim();
    if (isProduction()) {
      if (!url || url.startsWith('file:') || !/^postgres(ql)?:\/\//i.test(url)) {
        throw new Error(
          'Production PrismaClient refused non-PostgreSQL DATABASE_URL (no SQLite fallback).',
        );
      }
    }
    await this.$connect();
    // SQLite PRAGMAs only for local/legacy tooling — never in production
    if (!isProduction() && url.startsWith('file:')) {
      await this.$queryRawUnsafe('PRAGMA journal_mode=WAL');
      await this.$queryRawUnsafe('PRAGMA busy_timeout=5000');
      await this.$queryRawUnsafe('PRAGMA foreign_keys=ON');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
