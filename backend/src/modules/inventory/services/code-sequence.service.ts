import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class CodeSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    key: string,
    startAt = 1000,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const row = await db.codeSequence.upsert({
      where: { key },
      create: { key, counter: startAt },
      update: { counter: { increment: 1 } },
    });
    // upsert update increments after create path returns startAt without increment on first create
    if (row.counter === startAt) {
      const exists = await db.codeSequence.findUnique({ where: { key } });
      if (exists && exists.counter === startAt) {
        // first value consumed
        return startAt;
      }
    }
    return row.counter;
  }

  /** Safer next: always increment and return new value */
  async nextCode(
    key: string,
    startAt = 1000,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const existing = await db.codeSequence.findUnique({ where: { key } });
    if (!existing) {
      await db.codeSequence.create({ data: { key, counter: startAt } });
      return startAt;
    }
    const updated = await db.codeSequence.update({
      where: { key },
      data: { counter: { increment: 1 } },
    });
    return updated.counter;
  }

  attributionToken() {
    return randomBytes(24).toString('hex');
  }

  variantBarcodeFromParts(_sku: string, seq: number) {
    return `DO-${String(seq).padStart(8, '0')}`;
  }

  /** كود صنف فريد: DA-1001, DA-1002, ... */
  async nextSku(tx?: Prisma.TransactionClient): Promise<string> {
    const n = await this.nextCode('product_sku_da', 1001, tx);
    return `DA-${String(n).padStart(4, '0')}`;
  }

  orderBarcodeFromNumber(orderNumber: string) {
    // ORD-2026-000001 -> keep as-is for scanning
    return orderNumber.startsWith('ORD-') ? orderNumber : `ORD-${orderNumber}`;
  }
}
