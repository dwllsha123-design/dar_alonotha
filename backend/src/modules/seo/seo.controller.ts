import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { SkipResponseTransform } from '../../common/decorators/skip-response-transform.decorator';
import { SeoService } from './seo.service';

@ApiExcludeController()
@SkipResponseTransform()
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Public()
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  robots() {
    return this.seo.robotsTxt();
  }

  @Public()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=900')
  async sitemap() {
    return this.seo.sitemapXml();
  }

  /** Crawler-friendly product HTML (proxied by nginx for known bots). */
  @Public()
  @Get('seo/product/:id')
  async productHtml(@Param('id') id: string, @Res() res: Response) {
    try {
      const html = await this.seo.renderProductHtml(id);
      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .setHeader('Cache-Control', 'public, max-age=300')
        .send(html);
    } catch (e) {
      const html = this.seo.renderNotFoundHtml(
        e instanceof NotFoundException
          ? 'المنتج غير موجود'
          : 'الصفحة غير موجودة',
      );
      res
        .status(404)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .setHeader('X-Robots-Tag', 'noindex, follow')
        .send(html);
    }
  }
}
