import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import fs from 'fs';
import path from 'path';

import { Message } from '../claude';
import { DeepReadonly } from '../types';

type StoredMessage = Message & {
  usage: number;
};

@Injectable()
export class HistoryService {
  private readonly filePath: string;
  private messages: StoredMessage[] = [];
  private totalInput: number = 0;
  private totalOutput: number = 0;

  constructor(private readonly config: ConfigService) {
    const relPath = this.config.get<string>(
      'agent.history.path',
      'history.json',
    );
    this.filePath = path.join(__dirname, '..', '..', relPath);
    this.load();
  }

  async add(question: StoredMessage, answer: StoredMessage): Promise<void> {
    this.messages.push(question, answer);

    this.totalInput += question.usage;
    this.totalOutput += answer.usage;

    await this.save();
  }

  get(): DeepReadonly<StoredMessage[]> {
    return this.messages;
  }

  get total() {
    return {
      input: this.totalInput,
      output: this.totalOutput,
    };
  }

  private load(): void {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      this.messages = JSON.parse(content) as StoredMessage[];

      for (const { role, usage } of this.messages) {
        if (role === 'assistant') this.totalOutput += usage;
        else this.totalInput += usage;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
    } catch (error) {}
  }
  private async save(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        this.filePath,
        JSON.stringify(this.messages, null, 2),
        'utf-8',
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
    } catch (error) {}
  }
}
