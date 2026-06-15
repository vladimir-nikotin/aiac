import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import fs from 'fs';
import path from 'path';

import { ClaudeService, Message } from '../claude';
import { HistoryService } from './history.service';
import {
  FACT_CHECK_SYSTEM_COMPARE,
  FACT_CHECK_SYSTEM_NEW,
  FACT_CHECK_USER_COMPARE,
  FACT_CHECK_USER_NEW,
} from './prompts';
import { DeepReadonly } from 'src/types';

@Injectable()
export class FactsService {
  private readonly filePath: string;

  constructor(
    private readonly claude: ClaudeService,
    private readonly config: ConfigService,
    private readonly history: HistoryService,
  ) {
    this.filePath = path.join(
      __dirname,
      '..',
      '..',
      this.config.get<string>('agent.facts.path', 'facts.md'),
    );
  }

  async create(
    model: string,
    messages: DeepReadonly<Message>[],
    answer: Message,
  ): Promise<void> {
    await this.askAndSave(
      model,
      [
        ...messages,
        answer,
        {
          content: [
            {
              text: FACT_CHECK_USER_NEW,
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
      FACT_CHECK_SYSTEM_NEW,
    );
  }

  async exist() {
    try {
      await fs.promises.access(this.filePath, fs.constants.F_OK);
      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return false;
    }
  }

  async update(
    model: string,
    question: Message,
    answer: Message,
  ): Promise<void> {
    const saved = await this.read();

    await this.askAndSave(
      model,
      [
        question,
        answer,
        {
          content: [
            {
              text: `${FACT_CHECK_USER_COMPARE}${saved}`,
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
      FACT_CHECK_SYSTEM_COMPARE,
    );
  }

  private async askAndSave(
    model: string,
    messages: DeepReadonly<Message>[],
    systemPrompt: string,
  ) {
    const {
      content,
      // TODO stop_reason,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      messages,
      model,
      system: systemPrompt,
    });

    if (content.length !== 1) {
      throw new Error(`Unexpected content length\n${JSON.stringify(content)}`);
      // SOON change to return;
    }
    const [first] = content;

    if (first.type !== 'text') {
      throw new Error(`Unexpected content type\n${JSON.stringify(first)}`);
      // SOON change to return;
    }

    const { text } = first;

    await this.save(text);

    this.history.updateUsage(input, output);
  }

  private async read(): Promise<string> {
    try {
      const content = await fs.promises.readFile(this.filePath, 'utf-8');
      return content;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return '';
    }
  }
  private async save(facts: string): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(this.filePath, facts, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
    } catch (error) {}
  }
}
