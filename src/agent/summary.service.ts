import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

@Injectable()
export class SummaryService {
  private readonly pathTpl: string;

  constructor(private readonly config: ConfigService) {
    const relPath = this.config.get<string>('agent.summary.dir', 'drafts');
    const prefix = this.config.get<string>('agent.summary.prefix', 'sum-');
    const dir = path.join(__dirname, '..', '..', relPath);

    fs.mkdirSync(dir, { recursive: true });

    this.pathTpl = path.join(dir, prefix);
  }

  async save(content: object) {
    try {
      const targetPath = `${this.pathTpl}${randomUUID()}.json`;
      await fs.promises.writeFile(
        targetPath,
        JSON.stringify(content, null, 2),
        'utf-8',
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
    } catch (error) {}
  }
}
