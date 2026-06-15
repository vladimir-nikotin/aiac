import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import fs from 'fs';
import path from 'path';

import { ClaudeContent, Message } from '../claude';
import { DeepReadonly } from '../types';

type StoredMessage = Message & {
  usage: number;
  // TODO type: 'message' упростит type guards
};
export type SummaryPoint = {
  content: ClaudeContent[];
  input: number;
  output: number;
  type: 'summary';
};
// type CheckPoint
type StoredMessageOrPoint = StoredMessage | SummaryPoint;

function isMessage(item: StoredMessageOrPoint): item is StoredMessage {
  return !('type' in item);
}
function isMessageRO(
  item: DeepReadonly<StoredMessageOrPoint>,
): item is DeepReadonly<StoredMessage> {
  return !('type' in item);
}
export function isSummaryRO(
  item: DeepReadonly<StoredMessageOrPoint>,
): item is DeepReadonly<SummaryPoint> {
  if (isMessageRO(item)) {
    return false;
  }
  return item.type === 'summary';
}
export function sMessageToMessage(
  sMessage: DeepReadonly<StoredMessage>,
): DeepReadonly<Message> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { usage, ...message } = sMessage;
  return message;
}

@Injectable()
export class HistoryService {
  private readonly filePath: string;
  private messages: StoredMessageOrPoint[] = [];
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

  getAll(): DeepReadonly<StoredMessageOrPoint>[] {
    return this.messages;
  }
  getMessages(): DeepReadonly<StoredMessage>[] {
    return this.messages.filter((item) => isMessage(item));
  }

  async summarize(
    inputTokens: number,
    outputTokens: number,
    content: ClaudeContent[],
  ) {
    this.totalInput += inputTokens;
    this.totalOutput += outputTokens;

    this.messages.push({
      content,
      input: inputTokens,
      output: outputTokens,
      type: 'summary',
    });

    await this.save();
  }

  get total() {
    return {
      input: this.totalInput,
      output: this.totalOutput,
    };
  }

  updateUsage(input: number, output: number) {
    this.totalInput += input;
    this.totalOutput += output;
    // TODO нарушает totals, надо логировать в общую историю тоже
  }

  private load(): void {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      this.messages = JSON.parse(content) as StoredMessageOrPoint[];

      for (const { role, usage } of this.messages.filter((item) =>
        isMessage(item),
      )) {
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
