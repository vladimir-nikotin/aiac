import { Injectable } from '@nestjs/common';

import fs from 'fs';
import path from 'path';

@Injectable()
export class DraftService {
  private readonly draftsPath: string;

  constructor() {
    // SOMEDAY config
    const relPath = 'drafts';
    this.draftsPath = path.join(__dirname, '..', relPath);
  }

  async get(name: string): Promise<string> {
    return fs.promises.readFile(path.join(this.draftsPath, `${name}.md`), {
      encoding: 'utf-8',
    });
  }

  async list(): Promise<string[]> {
    const files: string[] = [];

    try {
      const dirFiles = await fs.promises.readdir(this.draftsPath);

      for (const file of dirFiles) {
        files.push(file);
      }

      return files;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return files;
    }
  }

  get path() {
    return this.draftsPath;
  }
}
